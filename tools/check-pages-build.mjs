#!/usr/bin/env node
// Usage: node tools/check-pages-build.mjs <dist dir> <base path>
//   e.g. node tools/check-pages-build.mjs demo/dist /bpmn-extension-synthea-module/
//
// Checks the built Pages site before it is deployed, because a deploy cannot be
// tried locally: project Pages serve from /<repo>/, so every asset must be requested
// from that sub-path, and the converter result under modules/ must be complete.
// Exit code 1 if anything is wrong.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const [dist, base] = process.argv.slice(2);
if (!dist || !base || !base.startsWith('/') || !base.endsWith('/')) {
  console.error('usage: check-pages-build <dist dir> <base path, e.g. /repo/>');
  process.exit(2);
}

const problems = [];
const fail = (msg) => problems.push(msg);
const read = (p) => readFileSync(join(dist, p), 'utf8');
const refs = (html) => [...html.matchAll(/\b(?:src|href)="([^"#?]+)[^"]*"/g)].map((m) => m[1]);

// 1. The modeler page: absolute asset paths carry the base path and point at real files.
if (!existsSync(join(dist, 'index.html'))) fail('index.html is missing');
else {
  const html = read('index.html');
  const assets = refs(html).filter((r) => r.startsWith('/'));
  if (!assets.length) fail('index.html references no built assets');
  for (const r of assets) {
    if (!r.startsWith(base)) fail(`index.html: "${r}" does not start with the base path ${base}`);
    else if (!existsSync(join(dist, r.slice(base.length)))) fail(`index.html: "${r}" does not exist in ${dist}`);
  }
  if (!refs(html).includes('modules/')) fail('index.html has no relative link to modules/');
}

// 2. The converter result: index page, report and every linked module exist; no conversion errors.
const modulesIndex = join(dist, 'modules', 'index.html');
if (!existsSync(modulesIndex)) fail('modules/index.html is missing');
else {
  for (const r of refs(read('modules/index.html'))) {
    if (r.startsWith('http') || r.startsWith('../')) continue;
    if (r.startsWith('/')) fail(`modules/index.html: absolute link "${r}" breaks under ${base}`);
    else if (!existsSync(join(dist, 'modules', r))) fail(`modules/index.html: linked file "${r}" is missing`);
  }
  const jsons = (dir) =>
    readdirSync(join(dist, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? jsons(join(dir, e.name)) : e.name.endsWith('.json') && !['report.json', 'build.json'].includes(e.name) ? [join(dir, e.name)] : []
    );
  const modules = existsSync(join(dist, 'modules')) ? jsons('modules') : [];
  if (!modules.length) fail('modules/ contains no module JSON');
  for (const m of modules) {
    try {
      const j = JSON.parse(read(m));
      if (!j.states || !Object.keys(j.states).length) fail(`${m}: no states`);
    } catch (err) {
      fail(`${m}: not valid JSON (${err.message})`);
    }
  }
  try {
    const b = JSON.parse(read('modules/build.json'));
    if (!b.commit || b.commit === 'unknown') fail('modules/build.json has no commit: the page cannot say which merge it shows');
    if (!/^\d{4}-\d\d-\d\dT/.test(b.date ?? '')) fail('modules/build.json has no valid date');
    if (!read('modules/index.html').includes(b.commit.slice(0, 7))) fail('modules/index.html does not show the commit of build.json');
  } catch (err) {
    fail(`modules/build.json: ${err.message}`);
  }
  try {
    const items = JSON.parse(read('modules/report.json'));
    const errors = items.filter((i) => i.level === 'error');
    if (errors.length) fail(`modules/report.json lists ${errors.length} error(s)`);
  } catch (err) {
    fail(`modules/report.json: ${err.message}`);
  }
}

if (problems.length) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
console.log(`Pages build OK (${dist}, base ${base})`);
