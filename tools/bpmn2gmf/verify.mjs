// Stage 6: structural checks on the generated modules.
import { missingFields } from './required-fields.mjs';

export function verifyModule(module, states, diag, { strict = false } = {}) {
  const where = { module: module.fileBase };
  const names = Object.keys(states);

  const targets = (s) => {
    if (s.direct_transition) return [s.direct_transition];
    if (s.distributed_transition) return s.distributed_transition.map((t) => t.transition);
    if (s.conditional_transition) return s.conditional_transition.map((t) => t.transition);
    if (s.complex_transition) return s.complex_transition.flatMap((t) => (t.distributions ?? [t]).map((d) => d.transition));
    return [];
  };

  for (const [name, s] of Object.entries(states)) {
    const t = targets(s);
    if (s.type === 'Terminal' && t.length) {
      diag.error('TERMINAL_HAS_TRANSITION', 'Terminal states cannot have a transition.', { ...where, element: name });
    }
    if (s.type !== 'Terminal' && !t.length) {
      diag.error('NO_TRANSITION', 'Non-terminal state has no outgoing transition.', { ...where, element: name });
    }
    for (const target of t) {
      if (!(target in states)) {
        diag.error('TRANSITION_TARGET_MISSING', `Transition target "${target}" does not exist.`, { ...where, element: name });
      }
    }
    const missing = missingFields(s);
    if (missing.length) {
      diag.add(
        strict ? 'error' : 'warning',
        'REQUIRED_FIELD_MISSING',
        `${s.type} state is missing required field(s) Synthea needs: ${missing.join(', ')}.`,
        { ...where, element: name }
      );
    }
    for (const distribution of [s.distributed_transition, ...(s.complex_transition ?? []).map((t) => t.distributions)]) {
      if (!distribution) continue;
      const numeric = distribution.map((x) => x.distribution).filter((d) => typeof d === 'number');
      const sum = numeric.reduce((a, b) => a + b, 0);
      if (numeric.length === distribution.length && Math.abs(sum - 1) > 1e-6) {
        diag.warn('DISTRIBUTION_SUM', `Distribution sums to ${sum}, not 1.0.`, { ...where, element: name });
      }
    }
  }

  if (!('Initial' in states)) return;
  const seen = new Set(['Initial']);
  const stack = ['Initial'];
  while (stack.length) {
    for (const t of targets(states[stack.pop()] ?? {})) {
      if (t in states && !seen.has(t)) {
        seen.add(t);
        stack.push(t);
      }
    }
  }
  for (const name of names) {
    if (!seen.has(name)) {
      diag.warn('STATE_UNREACHABLE', 'State is not reachable from Initial.', { ...where, element: name });
    }
  }
}

// Cross-module: every CallSubmodule must name a module of the same run; no cycles.
export function verifySubmodules(modules, diag) {
  const byName = new Map(modules.map((m) => [m.fileBase, m]));
  const calls = new Map();
  for (const m of modules) {
    calls.set(m.fileBase, new Set());
    for (const [name, s] of Object.entries(m.states ?? {})) {
      if (s.type !== 'CallSubmodule') continue;
      if (!byName.has(s.submodule)) {
        diag.error('SUBMODULE_NOT_FOUND', `Submodule "${s.submodule}" is not among the converted files.`, { module: m.fileBase, element: name });
      } else calls.get(m.fileBase).add(s.submodule);
    }
  }
  const state = new Map();
  const visit = (name, trail) => {
    if (state.get(name) === 'done') return;
    if (state.get(name) === 'active') {
      diag.error('SUBMODULE_CYCLE', `Circular submodule calls: ${[...trail, name].join(' -> ')}.`, { module: name });
      return;
    }
    state.set(name, 'active');
    for (const next of calls.get(name) ?? []) visit(next, [...trail, name]);
    state.set(name, 'done');
  };
  for (const name of calls.keys()) visit(name, []);
}
