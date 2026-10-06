// Optional output pass (--fuse-gateways): removes the Simple states that only
// exist because the diagram has a gateway. Always correct without it (every
// gateway is a Simple state that carries a transition, implicit-rules Section D),
// but upstream modules put the branching on the clinical state itself and have
// few Simple states, so the fused output is closer to hand-written modules.
//
//   pass-through  a gateway that only continues to one state (a join): every
//                 transition to it goes to its target instead
//   branching     a gateway that is entered from exactly one state through a
//                 direct transition: that state takes over its conditional /
//                 distributed transition
//
// Kept as they are: states the modeler drew as a Simple task, gateways with
// several predecessors (they would lose a branch), and gateways a PriorState
// condition refers to by name.
const TRANSITIONS = ['direct_transition', 'distributed_transition', 'conditional_transition'];
const transitionKey = (state) => TRANSITIONS.find((k) => k in state);

function targetsOf(state) {
  const out = [];
  if (state.direct_transition !== undefined) out.push(state.direct_transition);
  for (const k of ['distributed_transition', 'conditional_transition']) {
    for (const t of state[k] ?? []) out.push(t.transition);
  }
  return out;
}

function retarget(state, rename) {
  if (state.direct_transition !== undefined) state.direct_transition = rename(state.direct_transition);
  for (const k of ['distributed_transition', 'conditional_transition']) {
    for (const t of state[k] ?? []) t.transition = rename(t.transition);
  }
}

// does any condition (in a transition or a Guard) name `name` as PriorState / since?
function referencedByCondition(states, name) {
  const walk = (c) => {
    if (!c || typeof c !== 'object') return false;
    if (c.condition_type === 'PriorState' && (c.name === name || c.since === name)) return true;
    return walk(c.condition) || (c.conditions ?? []).some(walk);
  };
  return Object.values(states).some(
    (s) => walk(s.allow) || (s.conditional_transition ?? []).some((t) => walk(t.condition))
  );
}

// `candidates`: names of the Simple states that come from BPMN gateways.
// Returns how many states were removed.
export function fuseGateways(states, candidates) {
  let removed = 0;
  let changed = true;

  while (changed) {
    changed = false;
    for (const name of candidates) {
      const gateway = states[name];
      if (!gateway || gateway.type !== 'Simple' || gateway.remarks) continue;
      const key = transitionKey(gateway);
      if (!key || referencedByCondition(states, name)) continue;
      if (targetsOf(gateway).includes(name)) continue;

      if (key === 'direct_transition') {
        const target = gateway.direct_transition;
        for (const state of Object.values(states)) {
          if (state !== gateway) retarget(state, (t) => (t === name ? target : t));
        }
        delete states[name];
        removed++;
        changed = true;
        continue;
      }

      const predecessors = Object.entries(states).filter(([n, s]) => n !== name && targetsOf(s).includes(name));
      if (predecessors.length !== 1) continue;
      const [, predecessor] = predecessors[0];
      if (predecessor.direct_transition !== name) continue;

      delete predecessor.direct_transition;
      predecessor[key] = gateway[key];
      delete states[name];
      removed++;
      changed = true;
    }
  }
  return removed;
}
