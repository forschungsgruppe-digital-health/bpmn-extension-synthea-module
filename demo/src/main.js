import './style.css';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import '@bpmn-io/properties-panel/dist/assets/properties-panel.css';
import 'bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css';

import BpmnModeler from 'bpmn-js/lib/Modeler';
import {
  BpmnPropertiesPanelModule,
  BpmnPropertiesProviderModule
} from 'bpmn-js-properties-panel';

import lintModule from 'bpmn-js-bpmnlint';

import { initConverterPanel } from './converter-panel.js';
import { initLiveCheck } from './live-check.js';
// Generated from .bpmnlintrc and the lint plugin by tools/pack-lint-config.mjs (npm run dev / build).
import bpmnlintConfig from './generated/lint-config.js';
import syntheaModule from '../../extension/src/index.js';
import syntheaModdle from '../../extension/model/synthea.json';

const modeler = new BpmnModeler({
  container: '#canvas',
  propertiesPanel: { parent: '#properties' },
  // The same lint rules as `npm run lint:valid`, live: problems show on the element while modeling.
  linting: { bpmnlint: bpmnlintConfig, active: true },
  additionalModules: [
    BpmnPropertiesPanelModule,
    BpmnPropertiesProviderModule,
    syntheaModule,
    lintModule
  ],
  moddleExtensions: {
    synthea: syntheaModdle
  }
});

// ---------------------------------------------------------------------------------------------
// Files. The modeler ships no diagrams: people open their own (files, a folder, drag and drop).
// Every open file is an entry { file, xml, dirty, savedAt }; `file` is its path inside the opened folder.
// `savedAt` is the position in the undo history that equals the file on disk (-1 right after opening,
// the current position after saving; null when unknown, e.g. a new or restored unsaved diagram). An
// entry is dirty only while the history is somewhere else, so undoing every change takes the mark away.
// The converter gets all entries, so a main pathway finds the submodules it calls.
// ---------------------------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
// Examples: the real lung cancer pathway of this repository, loaded only when asked for (one chunk
// per file, so nothing is downloaded up front). Everything else in the modeler is the user's own.
const exampleLoaders = import.meta.glob('../../lung-cancer/*.bpmn', { query: '?raw', import: 'default' });
const SESSION_KEY = 'synthea-modeler-session-v1';
const files = []; // open entries, in the order they were opened
let current = null; // the entry shown on the canvas
let opening = Promise.resolve(); // switches and loads run one after another
// One failing step must not block every later one.
const enqueue = (step) => {
  opening = opening.then(step).catch((err) => {
    console.error(err);
    toast(`Something went wrong: ${err.message}`, 'error');
  });
  return opening;
};

function toast(message, kind = 'info') {
  const el = $('#toast');
  el.textContent = message;
  el.className = kind;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 8000 : 4000);
}

// Zooming immediately after import can run before (a) the #canvas container
// has a laid-out, non-zero size (e.g. right after initial page load, CSS/font
// loading still settling) and/or (b) diagram-js has actually rendered the
// imported elements, so their combined bounding box is still 0x0 — either one
// makes diagram-js compute a non-finite scale factor. A single
// requestAnimationFrame is not always enough for either condition, so poll
// both the container's rendered size and the default layer's content bbox
// across frames (bounded, so a genuinely broken layout/render doesn't spin
// forever) before zooming, and don't let a still-failing zoom take down the
// whole import.
function waitForLayout(canvas, maxFrames = 30) {
  return new Promise((resolve) => {
    let frames = 0;
    const started = performance.now();
    const container = canvas.getContainer();

    function check() {
      const { width, height } = container.getBoundingClientRect();
      const bbox = canvas.getDefaultLayer().getBBox();
      const ready = width > 0 && height > 0 && bbox.width > 0 && bbox.height > 0;

      if (ready || frames >= maxFrames || performance.now() - started > 1500) {
        resolve();
        return;
      }

      frames += 1;
      requestAnimationFrame(check);
    }

    requestAnimationFrame(check);
  });
}

async function fitViewport() {
  const canvas = modeler.get('canvas');
  await waitForLayout(canvas);
  try {
    canvas.zoom('fit-viewport');
  } catch (zoomErr) {
    console.error('failed to fit viewport (diagram is still imported and usable)', zoomErr);
  }
}

// Writes the diagram on the canvas back into its entry (before switching away or saving).
async function syncCurrent() {
  if (!current) return;
  const { xml } = await modeler.saveXML();
  current.xml = xml;
}

const baseName = (path) => path.split('/').pop();
const dirName = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

function renderFileList() {
  const list = $('#file-list');
  list.innerHTML = '';
  for (const entry of files) {
    const li = document.createElement('li');
    li.className = entry === current ? 'active' : '';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'file';
    open.title = entry.file;
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = baseName(entry.file) + (entry.dirty ? ' •' : '');
    open.appendChild(name);
    if (dirName(entry.file)) {
      const dir = document.createElement('span');
      dir.className = 'file-dir';
      dir.textContent = dirName(entry.file);
      open.appendChild(dir);
    }
    open.addEventListener('click', () => switchTo(entry));
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.title = 'Close this file';
    close.setAttribute('aria-label', `Close ${entry.file}`);
    close.textContent = '×';
    close.addEventListener('click', () => closeFile(entry));
    li.append(open, close);
    list.appendChild(li);
  }
}

function renderChrome() {
  const has = files.length > 0;
  document.body.classList.toggle('has-files', has);
  $('#welcome').hidden = has;
  $('#convert').disabled = !current;
  $('#download').disabled = !current;
  $('#live-status').hidden = !current;
  const name = $('#current-name');
  name.hidden = !current;
  name.textContent = current ? `${current.file}${current.dirty ? ' • unsaved changes' : ''}` : '';
  renderFileList();
}

// Keeps the session in this browser, so a reload does not lose the work. Best effort: storage can be
// full or blocked, then the modeler just works without it.
let persistTimer = null;
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(async () => {
    try {
      await syncCurrent();
      if (!files.length) localStorage.removeItem(SESSION_KEY);
      else localStorage.setItem(SESSION_KEY, JSON.stringify({ current: current?.file, files: files.map(({ file, xml, dirty }) => ({ file, xml, dirty })) }));
    } catch { /* not persisted */ }
  }, 800);
}

// Position in the undo history; importing a diagram starts a fresh one at -1.
const historyPosition = () => modeler.get('commandStack')._stackIdx;

async function showEntry(entry) {
  try {
    await modeler.importXML(entry.xml);
  } catch (err) {
    console.error('failed to import diagram', err);
    toast(`${entry.file} could not be opened: ${err.message}`, 'error');
    files.splice(files.indexOf(entry), 1);
    current = null;
    return false;
  }
  current = entry;
  entry.savedAt = entry.dirty ? null : historyPosition();
  renderChrome();
  fitViewport(); // not awaited: a hidden tab paints late and must not hold up the next step
  return true;
}

function switchTo(entry) {
  if (entry === current) return opening;
  enqueue(async () => {
    await syncCurrent();
    if (!(await showEntry(entry)) && files.length) await showEntry(files[0]);
    renderChrome();
    persistSoon();
  });
  return opening;
}

function closeFile(entry) {
  if (entry.dirty && !confirm(`${entry.file} has unsaved changes. Close it anyway?`)) return;
  enqueue(async () => {
    const wasCurrent = entry === current;
    files.splice(files.indexOf(entry), 1);
    if (wasCurrent) {
      current = null;
      if (files.length) await showEntry(files[0]);
      else await modeler.clear?.();
    }
    renderChrome();
    persistSoon();
  });
}

function closeAll() {
  if (files.some((f) => f.dirty) && !confirm('Some files have unsaved changes. Close all files anyway?')) return;
  enqueue(async () => {
    files.length = 0;
    current = null;
    await modeler.clear?.();
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    renderChrome();
  });
}

const isXmlWellFormed = (xml) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return !doc.querySelector('parsererror') && /definitions/.test(doc.documentElement.localName);
};

// items: [{ path, read: () => Promise<string> }]
function addFiles(items) {
  enqueue(async () => {
    const bpmn = items.filter((i) => /\.(bpmn|xml)$/i.test(i.path));
    const skipped = items.length - bpmn.length;
    if (!bpmn.length) {
      toast(items.length ? 'No .bpmn or .xml files found there.' : 'Nothing to open.', 'error');
      return;
    }
    await syncCurrent();
    let added = 0;
    let replaced = 0;
    const bad = [];
    let first = null;
    for (const item of bpmn) {
      let xml;
      try {
        xml = await item.read();
      } catch {
        bad.push(item.path);
        continue;
      }
      if (!isXmlWellFormed(xml)) {
        bad.push(item.path);
        continue;
      }
      const existing = files.find((f) => f.file === item.path);
      if (existing) {
        existing.xml = xml;
        existing.dirty = false;
        replaced += 1;
        first ??= existing;
      } else {
        const entry = { file: item.path, xml, dirty: false };
        files.push(entry);
        added += 1;
        first ??= entry;
      }
    }
    if (first) await showEntry(first);
    renderChrome();
    persistSoon();
    const parts = [];
    if (added) parts.push(`opened ${added} file${added === 1 ? '' : 's'}`);
    if (replaced) parts.push(`reloaded ${replaced}`);
    if (skipped) parts.push(`skipped ${skipped} that ${skipped === 1 ? 'is' : 'are'} not BPMN`);
    if (bad.length) toast(`Could not read ${bad.join(', ')}: not a valid BPMN file.${parts.length ? ` Otherwise: ${parts.join(', ')}.` : ''}`, 'error');
    else if (parts.length) toast(parts.join(', ').replace(/^./, (c) => c.toUpperCase()) + '.');
  });
}

const fromFileList = (list) => [...list].map((file) => ({ path: file.webkitRelativePath || file.name, read: () => file.text() }));

// Walks dropped files and folders (webkitGetAsEntry is the only way to read a dropped folder).
async function fromDataTransfer(dt) {
  const entries = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return fromFileList(dt.files);
  const out = [];
  async function walk(entry) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      out.push({ path: entry.fullPath.replace(/^\//, ''), read: () => file.text() });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      for (;;) {
        const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child);
      }
    }
  }
  for (const entry of entries) await walk(entry);
  return out;
}

function newDiagram() {
  enqueue(async () => {
    await syncCurrent();
    let n = 1;
    const used = new Set(files.map((f) => f.file));
    while (used.has(n === 1 ? 'new-diagram.bpmn' : `new-diagram-${n}.bpmn`)) n += 1;
    const file = n === 1 ? 'new-diagram.bpmn' : `new-diagram-${n}.bpmn`;
    try {
      await modeler.createDiagram();
      const { xml } = await modeler.saveXML();
      const entry = { file, xml, dirty: true };
      files.push(entry);
      current = entry;
      renderChrome();
      fitViewport();
      persistSoon();
    } catch (err) {
      console.error('failed to create new diagram', err);
      toast(`Could not create a new diagram: ${err.message}`, 'error');
    }
  });
}

async function saveCurrent() {
  if (!current) return;
  try {
    const { xml } = await modeler.saveXML({ format: true });
    const blob = new Blob([xml], { type: 'application/xml' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = baseName(current.file);
    link.click();
    URL.revokeObjectURL(link.href);
    current.xml = xml;
    current.dirty = false;
    current.savedAt = historyPosition();
    renderChrome();
    persistSoon();
  } catch (err) {
    console.error('failed to export diagram', err);
    toast(`Could not save: ${err.message}`, 'error');
  }
}

// Marks the open file as changed.
modeler.get('eventBus').on('commandStack.changed', () => {
  if (current) {
    const dirty = current.savedAt == null || historyPosition() !== current.savedAt;
    if (dirty !== current.dirty) {
      current.dirty = dirty;
      renderChrome();
    }
  }
  persistSoon();
});

// Buttons.
const pick = (input) => () => { input.value = ''; input.click(); };
$('#open-files').addEventListener('click', pick($('#file-input')));
$('#welcome-files').addEventListener('click', pick($('#file-input')));
$('#open-folder').addEventListener('click', pick($('#folder-input')));
$('#welcome-folder').addEventListener('click', pick($('#folder-input')));
$('#file-input').addEventListener('change', (e) => addFiles(fromFileList(e.target.files)));
$('#folder-input').addEventListener('change', (e) => addFiles(fromFileList(e.target.files)));
// Examples menu.
const EXAMPLE_LABELS = {
  'synthea-lung-cancer.bpmn': 'Main pathway (calls the four submodules)',
  'lung-cancer-probabilities-submodule.bpmn': 'Probabilities (submodule)',
  'lung-cancer-treatment-submodule.bpmn': 'Treatment cycle (submodule)',
  'symptom-check-submodule.bpmn': 'Symptom check (submodule)',
  'anemia-submodule.bpmn': 'Anemia (submodule)'
};
const exampleItems = Object.entries(exampleLoaders)
  .map(([path, read]) => ({ path: `lung-cancer/${baseName(path)}`, read }))
  .sort((a, b) => (a.path.includes('synthea-lung-cancer') ? -1 : b.path.includes('synthea-lung-cancer') ? 1 : a.path.localeCompare(b.path)));
const examplesMenu = $('#examples-menu');
function closeExamples() {
  examplesMenu.hidden = true;
  $('#examples').setAttribute('aria-expanded', 'false');
}
function addMenuItem(label, hint, onClick) {
  const item = document.createElement('button');
  item.type = 'button';
  item.setAttribute('role', 'menuitem');
  item.innerHTML = '<span></span><small></small>';
  item.firstChild.textContent = label;
  item.lastChild.textContent = hint;
  item.addEventListener('click', () => { closeExamples(); onClick(); });
  examplesMenu.appendChild(item);
}
if (exampleItems.length) {
  addMenuItem('Lung cancer pathway: all five files', 'The main pathway with its submodules; opens like a folder.', () => addFiles(exampleItems));
  const sep = document.createElement('hr');
  examplesMenu.appendChild(sep);
  for (const item of exampleItems) {
    addMenuItem(EXAMPLE_LABELS[baseName(item.path)] ?? baseName(item.path), baseName(item.path), () => addFiles([item]));
  }
} else {
  $('#examples').hidden = true;
  $('#welcome-example').hidden = true;
}
$('#examples').addEventListener('click', (e) => {
  e.stopPropagation();
  const open = examplesMenu.hidden;
  examplesMenu.hidden = !open;
  $('#examples').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => { if (!examplesMenu.contains(e.target)) closeExamples(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeExamples(); });
$('#welcome-example').addEventListener('click', () => addFiles(exampleItems));
$('#new-diagram').addEventListener('click', newDiagram);
$('#welcome-new').addEventListener('click', newDiagram);
$('#download').addEventListener('click', saveCurrent);
$('#close-all').addEventListener('click', closeAll);
$('#files-toggle').addEventListener('click', () => document.body.classList.toggle('files-open'));
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveCurrent();
  }
});

// Drag and drop anywhere on the page.
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  dragDepth += 1;
  $('#drop-overlay').hidden = false;
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#drop-overlay').hidden = true;
});
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', async (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  $('#drop-overlay').hidden = true;
  addFiles(await fromDataTransfer(e.dataTransfer));
});

// Theme: same switch and storage key as the docs site.
$('#theme').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('starlight-theme', next); } catch { /* ignore */ }
});

// The site (overview, guides, converter result) only exists in the built Pages site, not under
// `vite dev` or in the Docker container. There, the links lead to the same pages on GitHub, and the
// ones without a counterpart are hidden: no link should end on a 404.
if (import.meta.env.DEV) {
  const repo = 'https://github.com/forschungsgruppe-digital-health/bpmn-extension-synthea-module';
  const onGithub = {
    '../': repo,
    '../start/quickstart/': `${repo}/blob/dev/docs/quickstart.md`,
    '../start/basics/': `${repo}/blob/dev/docs/basics.md`,
    '../modeling/modeling-guide/': `${repo}/blob/dev/docs/modeling-guide.md`
  };
  for (const a of document.querySelectorAll('a[href^="../"]')) {
    const target = onGithub[a.getAttribute('href')];
    if (!target) { a.hidden = true; continue; }
    a.href = target;
    a.target = '_blank';
    a.rel = 'noopener';
  }
}

const converterPanel = initConverterPanel({
  getXml: async () => (await modeler.saveXML({ format: true })).xml,
  getCurrent: () => current,
  getFiles: () => files
});

initLiveCheck({
  modeler,
  compute: converterPanel.compute,
  getCurrent: () => current,
  showMessages: () => converterPanel.show('messages')
});

// Restore the last session of this browser.
try {
  const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  if (saved?.files?.length) {
    for (const f of saved.files) files.push({ file: f.file, xml: f.xml, dirty: !!f.dirty });
    enqueue(async () => {
      const start = files.find((f) => f.file === saved.current) || files[0];
      await showEntry(start);
      renderChrome();
      toast(`Restored ${files.length} file${files.length === 1 ? '' : 's'} from your last visit.`);
    });
  }
} catch { /* nothing to restore */ }
renderChrome();
