// Stage 2c: link events. A link throw event and the link catch event with the same name are one
// jump drawn in two pieces (a way to avoid long or crossing flows). GMF has no such event, so the pair
// is removed and the flows into the throw event go straight to what follows the catch event.

export function resolveLinks(module, diag) {
  const where = (n) => ({ module: module.fileBase, element: n.id, label: n.label });
  const links = [...module.nodes.values()].filter((n) => n.link);
  if (!links.length) return;

  // paired by name, ignoring case and surrounding blanks ("Re-Evaluation" = "Re-evaluation")
  const key = (n) => n.link.name?.trim().toLowerCase();
  const catches = new Map();
  for (const n of links.filter((x) => x.link.role === 'catch')) {
    if (!n.link.name) {
      diag.error('LINK_NAME_MISSING', 'A link event needs a name; the throw and the catch event are paired by it.', where(n));
    } else if (catches.has(key(n))) {
      diag.error('LINK_DUPLICATE_CATCH', `More than one link catch event is named "${n.link.name}".`, where(n));
    } else catches.set(key(n), n);
  }

  const drop = (n) => {
    for (const e of [...n.incoming, ...n.outgoing]) {
      module.edges.splice(module.edges.indexOf(e), 1);
      const other = module.nodes.get(e.from === n.id ? e.to : e.from);
      if (other) {
        other.outgoing = other.outgoing.filter((x) => x !== e);
        other.incoming = other.incoming.filter((x) => x !== e);
      }
    }
    module.nodes.delete(n.id);
  };

  const used = new Set();
  const ok = [];
  for (const n of links) {
    const others = Object.keys(n.ext).filter((t) => t.startsWith('synthea:'));
    if (others.length) {
      diag.error('LINK_HAS_CONFIG', `A link event produces no state, but it carries ${others.join(', ')}.`, where(n));
    } else if (n.link.role === 'throw') {
      const target = catches.get(key(n));
      if (!n.link.name) diag.error('LINK_NAME_MISSING', 'A link event needs a name; the throw and the catch event are paired by it.', where(n));
      else if (!target) diag.error('LINK_UNMATCHED', `No link catch event named "${n.link.name}" in this process.`, where(n));
      else if (n.outgoing.length || !n.incoming.length) diag.error('LINK_FLOW', 'A link throw event needs an incoming flow and no outgoing flow.', where(n));
      else if (target.incoming.length || target.outgoing.length !== 1) diag.error('LINK_FLOW', 'A link catch event needs one outgoing flow and no incoming flow.', where(target));
      else {
        used.add(target);
        ok.push([n, target]);
      }
    }
  }
  for (const [name, c] of catches) {
    if (!used.has(c) && !diag.items.some((i) => i.element === c.id && i.level === 'error' && i.module === module.fileBase)) {
      diag.error('LINK_UNMATCHED', `No link throw event named "${name}" in this process.`, where(c));
    }
  }

  for (const [thrower, catcher] of ok) {
    const [after] = catcher.outgoing;
    const hasConfig = !!(after.condition || after.probability);
    if (thrower.incoming.some((e) => hasConfig && (e.condition || e.probability))) {
      diag.error('LINK_EDGE_CONFLICT', `A flow into the link event and the flow after "${catcher.label || catcher.id}" both carry a condition or probability; keep it on one of them.`, where(thrower));
      continue;
    }
    // Retarget in place: the position of each flow among its source's outgoing flows must not change.
    const target = module.nodes.get(after.to);
    for (const e of thrower.incoming) {
      e.to = target.id;
      e.condition ??= after.condition;
      e.probability ??= after.probability;
      e.label ||= after.label;
      target.incoming.push(e);
    }
    thrower.incoming = [];
    drop(thrower);
    drop(catcher);
    const byLabel = thrower.link.byLabel || catcher.link.byLabel;
    diag.note('LINK_RESOLVED', `The link "${thrower.link.name}" is replaced by a direct flow to the element after its catch event${byLabel ? ' (paired by the event label, because the link definition has no name)' : ''}.`, where(thrower));
  }

  // pairs that could not be resolved are gone from the IR so that later stages do not report them again
  for (const n of links) {
    if (module.nodes.has(n.id)) drop(n);
  }
}
