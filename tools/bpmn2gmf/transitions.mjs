// Table C of implicit-rules.md: outgoing sequence flows -> GMF transition.
import { conditionToGmf, num } from './conditions.mjs';

// 0.1 + 0.2 style float noise is not meaningful here.
const round = (n) => Math.round(n * 1e9) / 1e9;

export function buildTransition(node, module, diag) {
  const where = { module: module.fileBase, element: node.id, label: node.label };
  const edges = node.outgoing;
  const target = (e) => module.nodes.get(e.to)?.stateName;

  if (edges.length === 0) return null;

  const withProb = edges.filter((e) => e.probability);
  const withCond = edges.filter((e) => e.condition);

  if (withProb.length && withCond.length) {
    diag.error(
      'TRANSITION_MIXED',
      'Outgoing flows mix probabilities and conditions; use one kind per element.',
      where
    );
    return null;
  }

  // distributed_transition ------------------------------------------------
  if (withProb.length) {
    const plain = edges.filter((e) => !e.probability);
    if (plain.length > 1) {
      diag.error('TRANSITION_PROBABILITY_MISSING', 'More than one outgoing flow has no probability.', where);
      return null;
    }
    // The last flow without a value receives the remainder (implicit-rules Table C).
    const ordered = [...withProb, ...plain];
    const fixedSum = withProb.reduce((s, e) => s + (num(e.probability.probability) ?? 0), 0);
    const distributed = ordered.map((e, i) => {
      const p = e.probability;
      let distribution;
      if (!p) distribution = round(1 - fixedSum);
      else if (p.probabilityAttribute) {
        distribution = { attribute: p.probabilityAttribute, default: num(p.probabilityDefault) ?? 0 };
      } else if (p.probability !== undefined) distribution = num(p.probability);
      else {
        diag.error('TRANSITION_PROBABILITY_EMPTY', 'probabilityConfig has neither probability nor probabilityAttribute.', { ...where, element: e.id });
        distribution = 0;
      }
      return { transition: target(e), distribution };
    });
    // With probabilities that come from attributes the sum is only known at run time. Synthea
    // gives whatever is left to the LAST branch, so the order of the flows matters.
    if (ordered.some((e) => e.probability?.probabilityAttribute)) {
      diag.note(
        'DISTRIBUTION_REMAINDER',
        `Probabilities from attributes: the last branch (${target(ordered[ordered.length - 1])}) receives whatever the others leave, so list the branch whose probability is the attribute's value before it.`,
        where
      );
    }
    return { distributed_transition: distributed };
  }

  // conditional_transition ------------------------------------------------
  if (withCond.length) {
    const fallbacks = edges.filter((e) => !e.condition);
    const ordered = [...withCond];
    if (fallbacks.length > 1) {
      diag.error('TRANSITION_BRANCH_WITHOUT_CONDITION', 'More than one outgoing flow has no condition.', where);
      return null;
    }
    if (fallbacks.length === 1 && !fallbacks[0].isDefault) {
      diag.warn(
        'TRANSITION_FALLBACK_NOT_DEFAULT',
        `Flow ${fallbacks[0].id} has no condition and is not marked as the gateway's default flow; treated as the fallback.`,
        where
      );
    }
    ordered.push(...fallbacks); // fallback always last
    const out = ordered.map((e) => {
      if (!e.condition) return { transition: target(e) };
      const condition = conditionToGmf(e.condition, (msg) =>
        diag.error('CONDITION_INVALID', msg, { ...where, element: e.id })
      );
      return { condition, transition: target(e) };
    });
    if (!fallbacks.length) {
      diag.note(
        'TRANSITION_NO_FALLBACK',
        'No fallback branch: if no condition matches, Synthea transitions to its default Terminal.',
        where
      );
    }
    return { conditional_transition: out };
  }

  // direct_transition -------------------------------------------------------
  if (edges.length === 1) return { direct_transition: target(edges[0]) };

  diag.error(
    'TRANSITION_AMBIGUOUS',
    `${edges.length} outgoing flows without conditions or probabilities; add synthea:conditionConfig or synthea:probabilityConfig to each branch.`,
    where
  );
  return null;
}
