// Stage 3: decide each node's GMF state type and state name.
import { descriptor } from './parse.mjs';
import { first } from './ir.mjs';

const STATE_TYPES = new Set(
  descriptor.types.find((t) => t.name === 'StateType').literalValues.map((v) => v.name)
);

// Kinds that only allow a fixed set of state types.
const ALLOWED_BY_KIND = {
  start: new Set(['Initial']),
  end: new Set(['Terminal', 'Death']),
  gateway: new Set(['Simple', 'Guard']),
  call: new Set(['CallSubmodule'])
};

function infer(node) {
  switch (node.kind) {
    case 'start': return 'Initial';
    case 'end': return 'Terminal';
    case 'call': return 'CallSubmodule';
    case 'event': return node.hasTimer ? 'Delay' : null;
    case 'gateway': return first(node.ext, 'synthea:GuardConfig') ? 'Guard' : 'Simple';
    default: return null;
  }
}

export function resolveStates(module, diag) {
  const where = (n) => ({ module: module.fileBase, element: n.id, label: n.label });

  for (const node of module.nodes.values()) {
    const explicit = first(node.ext, 'synthea:StateTypeConfig')?.stateType;
    if (explicit && !STATE_TYPES.has(explicit)) {
      diag.error('STATE_TYPE_UNKNOWN', `"${explicit}" is not a known state type.`, where(node));
      continue;
    }
    const stateType = explicit ?? infer(node);
    if (!stateType) {
      diag.error(
        'STATE_TYPE_REQUIRED',
        'Cannot determine the state type; set synthea:stateTypeConfig on this element.',
        where(node)
      );
      continue;
    }
    const allowed = ALLOWED_BY_KIND[node.kind];
    if (allowed && !allowed.has(stateType)) {
      diag.error(
        'STATE_TYPE_MISMATCH',
        `A ${node.bpmnType} cannot be a ${stateType} state (allowed: ${[...allowed].join(', ')}).`,
        where(node)
      );
      continue;
    }
    node.stateType = stateType;
  }

  // The Initial state must be called "Initial" (wiki + Module.java); reserve it first.
  const used = new Set();
  const starts = [...module.nodes.values()].filter((n) => n.stateType === 'Initial');
  if (starts.length !== 1) {
    diag.error(
      'INITIAL_COUNT',
      `A module needs exactly one start event, found ${starts.length}.`,
      { module: module.fileBase }
    );
  }
  for (const s of starts) {
    s.stateName = 'Initial';
    used.add('Initial');
  }

  // Everything else: the BPMN label verbatim (decision 2), id-based fallback and
  // de-duplication, in document order so the result is deterministic.
  for (const node of module.nodes.values()) {
    if (!node.stateType || node.stateName) continue;
    let name = node.label.trim() || `${node.stateType}_${node.id}`;
    if (used.has(name)) {
      const unique = `${name}_${node.id}`;
      diag.note('STATE_NAME_DUPLICATE', `State name "${name}" is already used; renamed to "${unique}".`, where(node));
      name = unique;
    }
    used.add(name);
    node.stateName = name;
  }
}
