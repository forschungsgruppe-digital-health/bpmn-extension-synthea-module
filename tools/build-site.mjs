#!/usr/bin/env node
// Usage: node tools/build-site.mjs [<base path>] [<out dir>]
//   e.g. node tools/build-site.mjs /bpmn-extension-synthea-module/ site
//
// Builds the whole GitHub Pages site into one directory, because Pages accepts exactly one
// artifact per deployment:
//   /          overview and guides   (docs-site, Astro + Starlight; pages generated from docs/)
//   /modeler/  the bpmn-js modeler   (demo, Vite)
//   /modules/  the converter result  (tools/build-converter-site.mjs, lung-cancer/)
//   /examples/ the lung cancer .bpmn files, to download and open in the modeler
// then runs tools/check-pages-build.mjs on it. Defaults: base "/", out dir "site".
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const base = process.argv[2] || '/';
const out = resolve(process.argv[3] || join(root, 'site'));
if (!base.startsWith('/') || !base.endsWith('/')) {
  console.error('base path must start and end with "/", e.g. /repo/');
  process.exit(2);
}

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts, env: { ...process.env, ...opts.env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// The docs site has its own dependency tree (it is not an npm workspace).
if (!existsSync(join(root, 'docs-site', 'node_modules'))) run('npm', ['--prefix', 'docs-site', 'install', '--no-audit', '--no-fund']);

run('npm', ['--prefix', 'docs-site', 'run', 'build'], { env: { DOCS_BASE_PATH: base } });
run('npm', ['--prefix', 'demo', 'run', 'build'], { env: { BASE_PATH: base } });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'docs-site', 'dist'), out, { recursive: true });
// Vite writes /<base>/assets (hashed names) and modeler/index.html; Astro uses _astro/, so nothing collides.
cpSync(join(root, 'demo', 'dist'), out, { recursive: true });

// The example files the Quickstart links to; the modeler itself ships none, people open their own.
mkdirSync(join(out, 'examples'), { recursive: true });
for (const f of readdirSync(join(root, 'lung-cancer')).filter((f) => f.endsWith('.bpmn'))) cpSync(join(root, 'lung-cancer', f), join(out, 'examples', f));

run('node', ['tools/build-converter-site.mjs', 'lung-cancer', '--out-dir', join(out, 'modules')]);
run('node', ['tools/check-pages-build.mjs', out, base]);
console.log(`site written to ${out}`);
