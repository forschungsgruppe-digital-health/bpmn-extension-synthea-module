// Stage 2d: parallel and inclusive gateways. GMF runs one state after the other and has neither
// parallelism nor "any of these", so a split and its matching join are rewritten into a sequence:
//
//   parallel   the branches run one after the other, in the order of the split's outgoing flows.
//   inclusive  each branch is taken or skipped on its own: a Simple state per branch decides with the
//              condition or probability of the branch's flow, so any combination of branches can happen.
//
// Only structured blocks are supported: every branch is a region with one way in and one way out (it
// may contain decisions, but no end event and no flow from or to the outside) and all branches meet in
// one join of the same kind. Nested blocks are rewritten from the inside out.
const KINDS = new Set(['parallel', 'inclusive']);
const hasConfig = (e) => !!(e.condition || e.probability);

// Collects the region behind one outgoing flow of the split, up to the join. Returns null when the
// region is not closed: another block inside (it comes first), an end event, a loop to the split, a
// flow into the region from outside, or no way to the join.
function walkBranch(entry, split, owned) {
  const nodes = [];
  const exits = [];
  let join = null;
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const edge = stack.pop();
    const node = edge.target;
    if (node === split) return null;
    if (node.kind === split.kind && node.incoming.length >= 2 && node.outgoing.length === 1) {
      if (join && join !== node) return null;
      join = node;
      exits.push(edge);
      continue;
    }
    if (KINDS.has(node.kind) || !node.outgoing.length) return null;
    if (seen.has(node)) continue;
    if (owned.has(node)) return null; // reached from two branches
    seen.add(node);
    nodes.push(node);
    stack.push(...[...node.outgoing].reverse());
  }
  if (!join) return null;
  for (const node of nodes) {
    if (node.incoming.some((e) => e !== entry && !seen.has(e.source))) return null; // entered from outside
  }
  nodes.forEach((n) => owned.add(n));
  return { entry, nodes, join, exits };
}

export function linearizeGateways(module, diag) {
  const where = (n) => ({ module: module.fileBase, element: n.id, label: n.label });
  const node = (id) => module.nodes.get(id);
  const nameOf = (n) => n.label || n.id;

  const unlink = (edge) => {
    module.edges.splice(module.edges.indexOf(edge), 1);
    const from = node(edge.from);
    const to = node(edge.to);
    if (from) from.outgoing = from.outgoing.filter((e) => e !== edge);
    if (to) to.incoming = to.incoming.filter((e) => e !== edge);
  };
  const link = (from, to, data = {}) => {
    const edge = { id: `${from.id}>${to.id}`, label: '', from: from.id, to: to.id, isDefault: false, condition: null, probability: null, ...data };
    module.edges.push(edge);
    from.outgoing.push(edge);
    to.incoming.push(edge);
    return edge;
  };
  // Retarget in place: the position of a flow among its source's outgoing flows must not change.
  const retarget = (edge, to) => {
    node(edge.to).incoming = node(edge.to).incoming.filter((e) => e !== edge);
    edge.to = to.id;
    to.incoming.push(edge);
  };

  // resolve each edge's ends once, so walkBranch can follow edges
  const withEnds = () => {
    for (const e of module.edges) {
      Object.defineProperty(e, 'target', { value: node(e.to), configurable: true, enumerable: false });
      Object.defineProperty(e, 'source', { value: node(e.from), configurable: true, enumerable: false });
    }
  };

  // a split that cannot be rewritten is reported once, and its join with it (no follow-up error there)
  const failed = new Set();
  const fail = (split, join, code, message) => {
    diag.error(code, message, where(split));
    failed.add(split);
    failed.add(join);
  };

  let progress = true;
  while (progress) {
    progress = false;
    withEnds();
    for (const split of module.nodes.values()) {
      if (!KINDS.has(split.kind) || failed.has(split) || split.outgoing.length < 2 || !split.incoming.length) continue;
      const owned = new Set();
      const branches = [];
      for (const entry of split.outgoing) {
        const b = walkBranch(entry, split, owned);
        if (!b) break;
        branches.push(b);
      }
      if (branches.length !== split.outgoing.length) continue; // not closed yet (an inner block comes first), or never
      const join = branches[0].join;
      if (branches.some((b) => b.join !== join) || join.incoming.length !== branches.reduce((n, b) => n + b.exits.length, 0)) continue;

      const label = nameOf(split);
      const [after] = join.outgoing;
      if (hasConfig(after)) {
        fail(split, join, `${split.kind.toUpperCase()}_JOIN_FLOW_CONFIG`, `The flow after the join "${nameOf(join)}" has a condition or probability; the join is not a choice, remove it.`);
        continue;
      }
      const successor = after.target;
      for (const b of branches) b.empty = b.entry.target === join;
      const nonEmpty = branches.filter((b) => !b.empty);
      const head = (b) => b.entry.target;

      if (split.kind === 'parallel') {
        if (branches.some((b) => hasConfig(b.entry))) {
          fail(split, join, 'PARALLEL_BRANCH_CONFIG', 'A flow out of a parallel gateway has a condition or probability; parallel branches are all taken. Use an inclusive gateway for optional branches.');
          continue;
        }
        const heads = nonEmpty.map(head);
        const start = heads[0] ?? successor;
        for (const e of [...split.incoming]) retarget(e, start);
        // every way out of a branch leads to the start of the next one
        nonEmpty.forEach((b, i) => b.exits.forEach((x) => retarget(x, heads[i + 1] ?? successor)));
        for (const b of branches) unlink(b.entry);
        unlink(after);
        diag.note('PARALLEL_LINEARIZED', `Parallel branches run one after the other, in this order: ${branches.map((b) => (b.empty ? '(empty)' : nameOf(head(b)))).join(', ')}.`, where(split));
      } else {
        const missing = nonEmpty.filter((b) => !hasConfig(b.entry));
        if (missing.length) {
          fail(split, join, 'INCLUSIVE_BRANCH_CONFIG_MISSING', `Every non-empty branch of an inclusive gateway needs a condition or probability (missing on flow ${missing.map((b) => b.entry.id).join(', ')}): each branch is decided on its own.`);
          continue;
        }
        // one deciding Simple state per branch: take the branch (its condition/probability) or skip it
        const deciders = nonEmpty.map((b, i) => ({
          b,
          state: {
            id: `${split.id}_branch${i + 1}`, kind: 'gateway', bpmnType: split.bpmnType,
            label: `${label}: ${nameOf(head(b))}`, ext: {}, hasTimer: false, defaultFlow: null, incoming: [], outgoing: []
          }
        }));
        for (const d of deciders) module.nodes.set(d.state.id, d.state);
        const start = deciders.length ? deciders[0].state : successor;
        for (const e of [...split.incoming]) retarget(e, start);
        deciders.forEach(({ b, state }, i) => {
          const next = deciders[i + 1]?.state ?? successor;
          link(state, head(b), { label: b.entry.label, condition: b.entry.condition, probability: b.entry.probability });
          link(state, next, { isDefault: true });
          b.exits.forEach((x) => retarget(x, next));
        });
        for (const b of branches) unlink(b.entry);
        unlink(after);
        diag.note('INCLUSIVE_CHAINED', `Inclusive branches are decided one after the other, each on its own (${deciders.length} deciding state(s)), so any combination can happen.`, where(split));
      }
      for (const n of [split, join]) {
        for (const e of [...n.incoming, ...n.outgoing]) unlink(e);
        module.nodes.delete(n.id);
      }
      progress = true;
      break; // the maps changed: look again from the start
    }
  }

  // what is left is not a structured block: report and drop, so later stages are not flooded
  for (const n of [...module.nodes.values()].filter((x) => KINDS.has(x.kind))) {
    if (!failed.has(n)) {
      diag.error(`${n.kind.toUpperCase()}_NOT_STRUCTURED`, `This ${n.kind} gateway is not part of a split and join block. Every branch must be a region with one way in and one way out (decisions are fine, but no end event, no loop back to the split, no flow into or out of it) and all branches must meet in one join of the same kind.`, where(n));
    }
    for (const e of [...n.incoming, ...n.outgoing]) unlink(e);
    module.nodes.delete(n.id);
  }
}
