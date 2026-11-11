// Stage 2b: elements marked synthea:documentationOnly stay in the diagram but get no GMF state.
// The element is removed from the IR and its incoming flows are joined to its outgoing flow, so
// the surrounding states are connected as if it were not there.
import { first } from './ir.mjs';

const BYPASSABLE = new Set(['task', 'gateway', 'event']);

export function bypassDocumentationNodes(module, diag) {
  const where = (n) => ({ module: module.fileBase, element: n.id, label: n.label });

  for (const node of [...module.nodes.values()]) {
    if (!first(node.ext, 'synthea:DocumentationOnly')) continue;

    const others = Object.keys(node.ext).filter((t) => t !== 'synthea:DocumentationOnly' && t.startsWith('synthea:'));
    if (others.length) {
      diag.error('DOCUMENTATION_ONLY_HAS_CONFIG', `A documentation-only element produces no state, but it also carries ${others.join(', ')}. Remove one or the other.`, where(node));
      continue;
    }
    if (!BYPASSABLE.has(node.kind)) {
      diag.error('DOCUMENTATION_ONLY_NOT_ALLOWED', `A ${node.bpmnType} cannot be documentation-only (only tasks, gateways and intermediate events can).`, where(node));
      continue;
    }
    if (node.outgoing.length !== 1 || !node.incoming.length) {
      diag.error('DOCUMENTATION_ONLY_NEEDS_ONE_EXIT', `A documentation-only element needs at least one incoming and exactly one outgoing flow (found ${node.incoming.length} in, ${node.outgoing.length} out), otherwise it is not clear where the flow continues.`, where(node));
      continue;
    }

    const [out] = node.outgoing;
    if (node.incoming.some((e) => e.from === node.id) || out.to === node.id) {
      diag.error('DOCUMENTATION_ONLY_LOOP', 'A documentation-only element must not flow into itself.', where(node));
      continue;
    }

    const joined = [];
    for (const incoming of node.incoming) {
      const both = (incoming.condition || incoming.probability) && (out.condition || out.probability);
      if (both) {
        diag.error('DOCUMENTATION_ONLY_EDGE_CONFLICT', `Flows "${incoming.id}" and "${out.id}" around this element both carry a condition or probability; keep it on one of them.`, where(node));
        joined.length = 0;
        break;
      }
      joined.push({
        ...incoming,
        id: `${incoming.id}+${out.id}`,
        to: out.to,
        condition: incoming.condition ?? out.condition,
        probability: incoming.probability ?? out.probability,
        label: incoming.label || out.label
      });
    }
    if (!joined.length) continue;

    // Replace in place: Synthea tries the branches of a transition in order, so the position of
    // each flow among its source's outgoing flows must not change.
    const target = module.nodes.get(out.to);
    target.incoming = target.incoming.filter((e) => e !== out);
    node.incoming.forEach((incoming, i) => {
      const swap = (list) => list.splice(list.indexOf(incoming), 1, joined[i]);
      swap(module.edges);
      swap(module.nodes.get(incoming.from).outgoing);
      target.incoming.push(joined[i]);
    });
    module.edges.splice(module.edges.indexOf(out), 1);
    module.nodes.delete(node.id);
    diag.note('DOCUMENTATION_ONLY', 'No state is generated for this element; its flows are joined.', where(node));
  }
}
