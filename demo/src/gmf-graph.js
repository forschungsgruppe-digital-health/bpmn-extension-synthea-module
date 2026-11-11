// Draws a Synthea GMF module (states + transitions) as an SVG graph, similar to
// the Synthea module builder. Pure function: JSON in, SVG string out.
import dagre from '@dagrejs/dagre';

const COLORS = {
  Initial: '#2e7d32',
  Terminal: '#c62828',
  Death: '#6d1b1b',
  Simple: '#757575',
  Encounter: '#1565c0',
  EncounterEnd: '#1565c0',
  CallSubmodule: '#6a1b9a',
  Delay: '#ef6c00',
  Guard: '#ef6c00',
  SetAttribute: '#00838f',
  Counter: '#00838f'
};
const DEFAULT_COLOR = '#455a64';
const colorOf = (type) => COLORS[type] ?? DEFAULT_COLOR;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function conditionText(c) {
  if (!c) return 'else';
  const { condition_type: t } = c;
  if (t === 'And' || t === 'Or') return `(${(c.conditions ?? []).map(conditionText).join(t === 'And' ? ' and ' : ' or ')})`;
  if (t === 'Not') return `not ${conditionText(c.condition)}`;
  const subject = c.attribute ?? c.name ?? c.codes?.[0]?.display ?? t;
  const value = c.value ?? c.quantity ?? '';
  return `${subject} ${c.operator ?? ''} ${value}`.trim();
}

const percent = (d) => {
  const p = typeof d === 'number' ? d : d?.default;
  return typeof p === 'number' ? `${+(p * 100).toFixed(2)} %` : '';
};

/** Outgoing edges of one state as [{ to, label, title }]. */
export function transitionsOf(state) {
  if (typeof state.direct_transition === 'string') return [{ to: state.direct_transition }];
  const out = [];
  for (const t of state.distributed_transition ?? []) {
    out.push({ to: t.transition, label: percent(t.distribution), title: t.distribution?.attribute });
  }
  for (const t of state.conditional_transition ?? []) {
    out.push({ to: t.transition, label: conditionText(t.condition) });
  }
  for (const t of state.complex_transition ?? []) {
    if (t.transition) out.push({ to: t.transition, label: conditionText(t.condition) });
    for (const d of t.distributions ?? []) {
      out.push({ to: d.transition, label: `${percent(d.distribution)}${t.condition ? ` if ${conditionText(t.condition)}` : ''}` });
    }
  }
  return out;
}

/** @returns {{ svg: string, width: number, height: number }} */
export function renderGraph(json) {
  const states = json.states ?? {};
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 56, marginx: 20, marginy: 20 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const [name, state] of Object.entries(states)) {
    const label = clip(name, 46);
    g.setNode(name, { width: Math.max(110, label.length * 6.6 + 24), height: 40, label, type: state.type });
  }
  let n = 0;
  for (const [name, state] of Object.entries(states)) {
    for (const e of transitionsOf(state)) {
      if (!states[e.to]) continue;
      const label = e.label ? clip(e.label, 30) : '';
      g.setEdge(name, e.to, { label, title: e.title ?? e.label, width: label.length * 6 + 8, height: label ? 16 : 0, labelpos: 'c' }, `e${n++}`);
    }
  }
  dagre.layout(g);

  const { width, height } = g.graph();
  const parts = [];
  for (const id of g.edges()) {
    const e = g.edge(id);
    const d = e.points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="#90a4ae" stroke-width="1.3" stroke-linejoin="round" marker-end="url(#arrow)"/>`);
    if (e.label) {
      parts.push(
        `<g><title>${esc(e.title ?? e.label)}</title><rect x="${e.x - e.width / 2}" y="${e.y - 8}" width="${e.width}" height="16" rx="3" fill="#fff" opacity="0.92"/>` +
          `<text x="${e.x}" y="${e.y + 4}" text-anchor="middle" font-size="10.5" fill="#37474f">${esc(e.label)}</text></g>`
      );
    }
  }
  for (const id of g.nodes()) {
    const v = g.node(id);
    const c = colorOf(v.type);
    parts.push(
      `<g><title>${esc(id)} (${esc(v.type)})</title>` +
        `<rect x="${v.x - v.width / 2}" y="${v.y - v.height / 2}" width="${v.width}" height="${v.height}" rx="8" fill="#fff" stroke="${c}" stroke-width="1.6"/>` +
        `<rect x="${v.x - v.width / 2}" y="${v.y - v.height / 2}" width="${v.width}" height="14" rx="8" fill="${c}"/>` +
        `<text x="${v.x}" y="${v.y - v.height / 2 + 10.5}" text-anchor="middle" font-size="9.5" fill="#fff" font-weight="600">${esc(v.type)}</text>` +
        `<text x="${v.x}" y="${v.y + 12}" text-anchor="middle" font-size="11" fill="#212121">${esc(v.label)}</text></g>`
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">` +
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#90a4ae"/></marker></defs>` +
    parts.join('') +
    `</svg>`;
  return { svg, width, height };
}
