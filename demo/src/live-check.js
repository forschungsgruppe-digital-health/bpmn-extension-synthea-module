// Live converter check: after every change the open diagram is converted in the background and the
// problems are shown where they are: a dashed outline and a "C" badge on the element (red = error,
// orange = warning, the message on hover) and a count in the toolbar. The bpmnlint rules are shown
// separately and on their own (bpmn-js-bpmnlint, see main.js: icon on the element, count at the
// bottom), so it is clear which of the two reports what. Unlike the lint, this is the plain
// conversion of the diagram together with the other opened files, so it also sees missing sub-modules.
import { fileBaseFor } from '../../extension/src/converter/convert.mjs';

const DEBOUNCE_MS = 500;
const OVERLAY_TYPE = 'synthea-converter-issue';

/**
 * @param {object} opts
 * @param {object} opts.modeler
 * @param {() => Promise<{diagnostics: {items: object[]}}>} opts.compute  converts the open diagram
 * @param {() => {file: string}|null} opts.getCurrent
 * @param {() => void} opts.showMessages  opens the converter panel on its Messages tab
 */
export function initLiveCheck({ modeler, compute, getCurrent, showMessages }) {
  const eventBus = modeler.get('eventBus');
  const canvas = modeler.get('canvas');
  const overlays = modeler.get('overlays');
  const registry = modeler.get('elementRegistry');
  const status = document.querySelector('#live-status');

  let timer = null;
  let run = 0; // only the latest conversion may update the screen
  let marked = []; // [elementId, marker] currently on the canvas

  function clear() {
    for (const [id, marker] of marked) canvas.removeMarker(id, marker);
    marked = [];
    overlays.remove({ type: OVERLAY_TYPE });
  }

  // The diagnostics of the open diagram: its own module, and the modules made from its sub-processes.
  function ownItems(items) {
    const own = fileBaseFor(getCurrent()?.file ?? '');
    return items.filter((i) => i.module === own || i.module?.startsWith(`${own}_`));
  }

  function show(items) {
    clear();
    const problems = items.filter((i) => i.level === 'error' || i.level === 'warning');
    const byElement = new Map();
    for (const i of problems) {
      if (!i.element || !registry.get(i.element)) continue; // flows made by the converter have no shape
      byElement.set(i.element, [...(byElement.get(i.element) ?? []), i]);
    }
    for (const [id, list] of byElement) {
      const level = list.some((i) => i.level === 'error') ? 'error' : 'warning';
      const marker = `synthea-converter-${level}`;
      canvas.addMarker(id, marker);
      marked.push([id, marker]);
      const badge = document.createElement('div');
      badge.className = `synthea-issue-badge ${level}`;
      badge.textContent = `C ${list.length}`;
      badge.title = `Converter\n\n${list.map((i) => `${i.level.toUpperCase()} ${i.code}: ${i.message}`).join('\n\n')}`;
      badge.addEventListener('click', showMessages);
      overlays.add(id, OVERLAY_TYPE, { position: { bottom: 8, right: 10 }, html: badge });
    }

    const errors = problems.filter((i) => i.level === 'error').length;
    const warnings = problems.length - errors;
    status.className = errors ? 'has-errors' : warnings ? 'has-warnings' : 'ok';
    status.textContent = errors || warnings
      ? `Converter: ${errors} error${errors === 1 ? '' : 's'} · ${warnings} warning${warnings === 1 ? '' : 's'}`
      : 'Converter: no problems';
    status.title = 'Converter check of this diagram (the lint is shown at the bottom of the canvas). Click for details.';
  }

  async function check() {
    const mine = ++run;
    if (!getCurrent()) { clear(); return; }
    try {
      const { diagnostics } = await compute();
      if (mine === run) show(ownItems(diagnostics.items));
    } catch (err) {
      if (mine !== run) return;
      clear();
      status.className = 'has-errors';
      status.textContent = 'Converter: check failed';
      status.title = String(err?.message ?? err);
    }
  }

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(check, DEBOUNCE_MS);
  };

  eventBus.on(['commandStack.changed', 'import.done'], schedule);
  status.addEventListener('click', showMessages);
  schedule();
}
