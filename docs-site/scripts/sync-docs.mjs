#!/usr/bin/env node
// Copies the Markdown guides from ../docs into the Starlight content folder, so ../docs stays
// the single source (readable on GitHub as well) and the site never carries a second copy.
// Per page: adds the front matter Starlight needs (title from the first heading, description
// from the first paragraph), drops the heading (Starlight renders the title) and rewrites the
// relative links between guides to site paths and all other relative links to GitHub.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const docsDir = join(here, '..', '..', 'docs');
const outRoot = join(here, '..', 'src', 'content', 'docs');
const REPO = 'https://github.com/forschungsgruppe-digital-health/bpmn-extension-synthea-module';

// source file (relative to docs/) -> site section; the page URL is /<section>/<file name>/
const PAGES = {
  'concepts.md': 'start',
  'synthea.md': 'start',
  'modeling-guide.md': 'modeling',
  'extension-matrix.md': 'modeling',
  'lint-rules.md': 'modeling',
  'implicit-rules.md': 'reference',
  'converter-overview.md': 'reference',
  'validator-overview.md': 'reference',
  'bpmn2gmf-concept.md': 'reference',
  'adr/0001-versioning-and-release-please.md': 'decisions',
  'adr/0002-encounter-as-flow-node.md': 'decisions',
  'adr/0003-encounter-context-implicit-scoping.md': 'decisions'
};
const slug = (src) => posix.basename(src, '.md');
const urlOf = (src) => `/${PAGES[src]}/${slug(src)}/`;

// A new file in docs/ that is neither mapped nor ignored is an error, not a silent omission.
const IGNORED = new Set(['adr/TEMPLATE.md']);
const found = [
  ...readdirSync(docsDir).filter((f) => f.endsWith('.md')),
  ...readdirSync(join(docsDir, 'adr')).filter((f) => f.endsWith('.md')).map((f) => `adr/${f}`)
];
const unmapped = found.filter((f) => !(f in PAGES) && !IGNORED.has(f));
if (unmapped.length) {
  console.error(`docs/ has pages that are not in scripts/sync-docs.mjs: ${unmapped.join(', ')}`);
  process.exit(1);
}

for (const section of new Set(Object.values(PAGES))) rmSync(join(outRoot, section), { recursive: true, force: true });

const yamlString = (s) => JSON.stringify(s);
const plain = (s) => s.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();

for (const [src, section] of Object.entries(PAGES)) {
  const raw = readFileSync(join(docsDir, src), 'utf8').replace(/\r\n/g, '\n');
  const lines = raw.split('\n');
  const h1 = lines.findIndex((l) => /^# /.test(l));
  if (h1 < 0) throw new Error(`${src}: no first-level heading`);
  const title = plain(lines[h1].slice(2));
  let body = lines.slice(h1 + 1).join('\n').replace(/^\n+/, '');
  const firstPara = body.split(/\n\s*\n/).find((p) => p.trim() && !/^(#|```|\||>|[-*] )/.test(p.trim()));
  let description = firstPara ? plain(firstPara) : '';
  if (description.length > 200) description = description.slice(0, 197).replace(/\s+\S*$/, '') + '…';

  // Relative Markdown links. Fenced code blocks are left alone.
  const fromDir = posix.dirname(src);
  let inFence = false;
  body = body
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line.replace(/\]\((?!https?:|mailto:|#|\/)([^)\s]+)\)/g, (all, target) => {
        const [path, hash = ''] = target.split('#');
        const resolved = posix.normalize(posix.join(fromDir, path));
        if (resolved in PAGES) return `](${urlOf(resolved)}${hash ? '#' + hash : ''})`;
        if (resolved.startsWith('img/')) return `](/${resolved})`;
        if (resolved === 'demo' || resolved === 'demo/') return '](/modeler/)';
        const kind = /\.\w+$/.test(resolved) ? 'blob' : 'tree';
        return `](${REPO}/${kind}/dev/${resolved.replace(/\/$/, '')}${hash ? '#' + hash : ''})`;
      });
    })
    .join('\n');

  const front = ['---', `title: ${yamlString(title)}`];
  if (description) front.push(`description: ${yamlString(description)}`);
  front.push(`editUrl: ${REPO}/edit/dev/docs/${src}`, '---', '');
  const out = join(outRoot, section, `${slug(src)}.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, front.join('\n') + '\n' + body);
}
// Images referenced by the guides are served from the site's public folder.
if (existsSync(join(docsDir, 'img'))) {
  rmSync(join(here, '..', 'public', 'img'), { recursive: true, force: true });
  cpSync(join(docsDir, 'img'), join(here, '..', 'public', 'img'), { recursive: true });
}
console.log(`sync-docs: ${Object.keys(PAGES).length} pages written to ${outRoot}`);
