// "Convert to Synthea" panel: runs the bpmn2gmf converter in the browser on the
// open diagram and shows the result as a graph, as JSON and as messages.
import { convert, fileBaseFor } from '../../tools/bpmn2gmf/convert.mjs';
import { explain } from '../../tools/bpmn2gmf/explanations.mjs';
import { renderGraph } from './gmf-graph.js';

const $ = (sel) => document.querySelector(sel);

/**
 * @param {object} opts
 * @param {() => Promise<string>} opts.getXml        XML of the diagram that is open now
 * @param {() => {file: string}} opts.getCurrent     the selected pathway ({ file } or the "new" diagram)
 * @param {{file: string, xml: string}[]} opts.pathways  all example pathways (submodules are called by the main one)
 */
export function initConverterPanel({ getXml, getCurrent, pathways }) {
  const panel = $('#converter-panel');
  const select = $('#cp-module');
  const body = $('#cp-body');
  const summary = $('#cp-summary');
  let result = null; // { modules, diagnostics }
  let tab = 'graph';
  let scale = 1;
  let graph = null;

  async function run() {
    const current = getCurrent();
    const xml = await getXml();
    const inputs = pathways.map((p) => ({ path: `lung-cancer/${p.file}`, xml: p.file === current.file ? xml : p.xml }));
    // A new, unsaved diagram is not one of the example files: convert it on its own.
    if (!pathways.some((p) => p.file === current.file)) inputs.splice(0, inputs.length, { path: current.file, xml });
    result = await convert(inputs);
    const own = fileBaseFor(current.file);
    select.innerHTML = '';
    for (const m of result.modules) {
      const o = document.createElement('option');
      o.value = m.fileBase;
      o.textContent = `${m.path}${m.ok ? '' : '  (errors)'}`;
      select.appendChild(o);
    }
    select.value = result.modules.some((m) => m.fileBase === own) ? own : result.modules[0]?.fileBase ?? '';
    // A module with errors has no graph or JSON: open on the messages that say what is wrong.
    tab = selected()?.ok === false ? 'messages' : 'graph';
    panel.style.top = `${$('.toolbar').offsetHeight}px`;
    panel.hidden = false;
    render();
  }

  const selected = () => result?.modules.find((m) => m.fileBase === select.value);
  const messagesOf = (m) => result.diagnostics.items.filter((i) => !i.module || i.module === m?.fileBase);

  function render() {
    const m = selected();
    const msgs = messagesOf(m);
    const count = (l) => msgs.filter((i) => i.level === l).length;
    summary.textContent = m
      ? `${Object.keys(m.json.states).length} states · ${count('error')} errors · ${count('warning')} warnings · ${count('note')} notes`
      : 'nothing converted';
    document.querySelectorAll('#cp-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $('#cp-graph-tools').hidden = tab !== 'graph';
    body.innerHTML = '';
    if (!m) return;

    if (tab === 'graph') {
      if (!m.ok) {
        body.innerHTML = '<p class="cp-note">This module has errors and was not converted. See Messages.</p>';
        return;
      }
      graph = renderGraph(m.json);
      const holder = document.createElement('div');
      holder.className = 'cp-graph';
      holder.innerHTML = graph.svg;
      body.appendChild(holder);
      fit();
    } else if (tab === 'json') {
      const pre = document.createElement('pre');
      pre.className = 'cp-json';
      pre.textContent = m.ok ? JSON.stringify(m.json, null, 2) : 'This module has errors and was not converted. See Messages.';
      body.appendChild(pre);
    } else {
      // Grouped by code: one explanation per kind of message, then every place it occurs.
      const wrap = document.createElement('div');
      wrap.className = 'cp-messages';
      const groups = new Map();
      for (const i of msgs) groups.set(i.code, [...(groups.get(i.code) ?? []), i]);
      if (!groups.size) wrap.textContent = 'No messages.';
      for (const [code, items] of groups) {
        const info = explain(code);
        const sec = document.createElement('section');
        sec.className = items[0].level;
        const h = document.createElement('h3');
        h.textContent = `${items[0].level.toUpperCase()}  ${code}  (${items.length}x)`;
        sec.appendChild(h);
        if (info) {
          const dl = document.createElement('dl');
          for (const [k, label] of [['what', 'What happened'], ['why', 'What it means'], ['fix', 'What to do']]) {
            const dt = document.createElement('dt');
            dt.textContent = label;
            const dd = document.createElement('dd');
            dd.textContent = info[k];
            dl.append(dt, dd);
          }
          sec.appendChild(dl);
        }
        const ul = document.createElement('ul');
        for (const i of items) {
          const li = document.createElement('li');
          const where = [i.element, i.label && `"${i.label}"`].filter(Boolean).join(' ');
          li.textContent = `${where ? `[${where}] ` : ''}${i.message}`;
          ul.appendChild(li);
        }
        sec.appendChild(ul);
        wrap.appendChild(sec);
      }
      body.appendChild(wrap);
    }
  }

  function applyScale() {
    const svg = body.querySelector('svg');
    if (!svg || !graph) return;
    svg.setAttribute('width', graph.width * scale);
    svg.setAttribute('height', graph.height * scale);
  }
  function fit() {
    if (!graph) return;
    scale = Math.min(1, (body.clientWidth - 24) / graph.width) || 1;
    applyScale();
  }
  const zoom = (f) => {
    scale = Math.min(3, Math.max(0.1, scale * f));
    applyScale();
  };

  $('#convert').addEventListener('click', () => run().catch((err) => {
    console.error('conversion failed', err);
    panel.hidden = false;
    body.textContent = `Conversion failed: ${err.message}`;
  }));
  $('#cp-close').addEventListener('click', () => { panel.hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) panel.hidden = true;
  });
  $('#cp-tabs').addEventListener('click', (e) => {
    if (e.target.dataset.tab) { tab = e.target.dataset.tab; render(); }
  });
  select.addEventListener('change', () => {
    if (selected()?.ok === false) tab = 'messages';
    render();
  });
  $('#cp-zoom-in').addEventListener('click', () => zoom(1.25));
  $('#cp-zoom-out').addEventListener('click', () => zoom(0.8));
  $('#cp-fit').addEventListener('click', fit);
  $('#cp-download').addEventListener('click', () => {
    const m = selected();
    if (!m?.ok) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`${JSON.stringify(m.json, null, 2)}\n`], { type: 'application/json' }));
    link.download = `${m.fileBase}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
}
