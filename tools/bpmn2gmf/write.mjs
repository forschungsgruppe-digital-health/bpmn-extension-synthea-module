// Writes converted modules into a modules directory (path = <dir>/<module path>.json).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export function writeModules(modules, outDir) {
  const written = [];
  for (const m of modules) {
    if (!m.ok) continue;
    const target = join(outDir, `${m.path}.json`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(m.json, null, 2)}\n`);
    written.push(m.path);
  }
  return written;
}
