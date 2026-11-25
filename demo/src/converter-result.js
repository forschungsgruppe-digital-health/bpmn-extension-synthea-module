// The result of the last conversion on the canvas. The conversion does not run on its own: it runs when
// the user presses "Convert to Synthea" (or the converter status in the toolbar). Its problems are then
// shown where they are: a dashed outline and a "C" badge on the element (red = error, orange = warning,
// the message on hover) and a count in the toolbar. The next change to the diagram removes them and the
// toolbar says the converter has not run since, so an old result is never taken for the current diagram.
//
// The bpmnlint rules run live and on their own (bpmn-js-bpmnlint, see main.js: icon on the element,
// count at the bottom); they include the converter's own checks (SYN-36, SYN-37). The conversion adds
// what the lint cannot see: the other opened files (a missing sub-module) and the generated modules.
import { fileBaseFor } from '../../extension/src/converter/convert.mjs';

const OVERLAY_TYPE = 'synthea-converter-issue';

/**
 * Shows the result of a conversion on the canvas and in the toolbar, until the diagram changes.
 *
 * @param {object} opts
 * @param {object} opts.modeler the bpmn-js modeler
 * @param {() => {file: string}|null} opts.getCurrent the entry shown on the canvas
 * @param {() => void} opts.showMessages converts and opens the converter panel on its Messages tab
 * @returns {{report: (diagnostics: {items: object[]}) => void, failed: (err: unknown) => void}} what the
 *   converter panel calls after each conversion
 */
export function initConverterResult({ modeler, getCurrent, showMessages }) {
  const eventBus = modeler.get('eventBus');
  const canvas = modeler.get('canvas');
  const overlays = modeler.get('overlays');
  const registry = modeler.get('elementRegistry');
  const status = document.querySelector('#live-status');

  let marked = []; // [elementId, marker] currently on the canvas

  function clear() {
    for (const [id, marker] of marked) canvas.removeMarker(id, marker);
    marked = [];
    overlays.remove({ type: OVERLAY_TYPE });
  }

  function notRun(text) {
    clear();
    status.className = 'live-status';
    status.textContent = text;
    status.title = 'Press to convert this diagram and see the messages (the lint is shown at the bottom of the canvas).';
  }

  // The diagnostics of the open diagram: its own module, and the modules made from its sub-processes.
  function ownItems(items) {
    const own = fileBaseFor(getCurrent()?.file ?? '');
    return items.filter((i) => i.module === own || i.module?.startsWith(`${own}_`));
  }

  function report(diagnostics) {
    clear();
    const problems = ownItems(diagnostics.items).filter((i) => i.level === 'error' || i.level === 'warning');
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
    status.className = `live-status ${errors ? 'has-errors' : warnings ? 'has-warnings' : 'ok'}`;
    status.textContent = errors || warnings
      ? `Converter: ${errors} error${errors === 1 ? '' : 's'} · ${warnings} warning${warnings === 1 ? '' : 's'}`
      : 'Converter: no problems';
    status.title = 'Result of the last conversion; it is removed at the next change. Click for the messages.';
  }

  function failed(err) {
    clear();
    status.className = 'live-status has-errors';
    status.textContent = 'Converter: failed';
    status.title = String(err?.message ?? err);
  }

  // Any change, and opening another diagram, makes the last result stale.
  eventBus.on('commandStack.changed', () => notRun('Converter: not run since the last change'));
  eventBus.on('import.done', () => notRun('Converter: not run'));
  status.addEventListener('click', showMessages);
  notRun('Converter: not run');

  return { report, failed };
}
