/**
 * Writes converted modules into a modules directory (path = <dir>/<module path>.json).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Writes the modules that have no error into a modules directory, one JSON file each.
 *
 * @param {{ok: boolean, path: string, json: object}[]} modules the result of `convert`
 * @param {string} outDir the modules directory; the file of a module is `<outDir>/<path>.json`
 * @returns {string[]} the paths of the modules that were written
 */
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
