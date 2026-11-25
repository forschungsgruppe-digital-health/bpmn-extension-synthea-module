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
  // 1. Get started: no prior knowledge needed
  'basics.md': 'start',
  'quickstart.md': 'start',
  'glossary.md': 'start',
  // 2. Model a pathway
  'modeling-guide.md': 'modeling',
  'extension-matrix.md': 'modeling',
  // 3. Check and convert
  'lint-rules.md': 'convert',
  'converter-overview.md': 'convert',
  'validator-overview.md': 'convert',
  'implicit-rules.md': 'convert',
  // 4. Background
  'synthea.md': 'background',
  // 5. For developers
  'concepts.md': 'developers',
  'extension-api.md': 'developers',
  'extension-api-types.md': 'developers',
  // Project & help. '../' marks a file at the repository root instead of docs/.
  '../CONTRIBUTING.md': 'project'
};
const slug = (src) => posix.basename(src, '.md').toLowerCase();
const urlOf = (src) => `/${PAGES[src]}/${slug(src)}/`;

// Pages for contributors (design concept, decision records) stay on GitHub and are not part of
// the site; links to them are rewritten to GitHub. A new file in docs/ that is neither mapped nor
// listed here is an error, not a silent omission.
const IGNORED = new Set(['bpmn2gmf-concept.md', 'adr/TEMPLATE.md']);
const found = [
  ...readdirSync(docsDir).filter((f) => f.endsWith('.md')),
  ...readdirSync(join(docsDir, 'adr')).filter((f) => f.endsWith('.md')).map((f) => `adr/${f}`)
];
const unmapped = found.filter((f) => !(f in PAGES) && !IGNORED.has(f) && !f.startsWith('adr/'));
if (unmapped.length) {
  console.error(`docs/ has pages that are not in scripts/sync-docs.mjs: ${unmapped.join(', ')}`);
  process.exit(1);
}

// Everything below a folder is generated (only index.mdx is hand-written), so clear all folders:
// a section that was renamed or dropped must not leave stale pages behind.
for (const e of readdirSync(outRoot, { withFileTypes: true })) if (e.isDirectory()) rmSync(join(outRoot, e.name), { recursive: true, force: true });

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
        const resolved = posix.normalize(posix.join(fromDir, path)); // relative to docs/
        if (resolved in PAGES) return `](${urlOf(resolved)}${hash ? '#' + hash : ''})`;
        if (resolved.startsWith('images/')) return `](/${resolved})`;
        const repoPath = posix.normalize(posix.join('docs', resolved)).replace(/\/$/, ''); // relative to the repository root
        if (repoPath === 'demo') return '](/modeler/)';
        const kind = /\.\w+$/.test(repoPath) ? 'blob' : 'tree';
        return `](${REPO}/${kind}/dev/${repoPath}${hash ? '#' + hash : ''})`;
      });
    })
    .join('\n');

  const front = ['---', `title: ${yamlString(title)}`];
  if (description) front.push(`description: ${yamlString(description)}`);
  front.push(`editUrl: ${REPO}/edit/dev/${posix.normalize(posix.join('docs', src))}`, '---', '');
  const out = join(outRoot, section, `${slug(src)}.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, front.join('\n') + '\n' + body);
}
// Images referenced by the guides are served from the site's public folder.
if (existsSync(join(docsDir, 'images'))) {
  rmSync(join(here, '..', 'public', 'images'), { recursive: true, force: true });
  cpSync(join(docsDir, 'images'), join(here, '..', 'public', 'images'), { recursive: true });
}
console.log(`sync-docs: ${Object.keys(PAGES).length} pages written to ${outRoot}`);
