const { is, getExtension } = require('../lib/utils');

/**
 * SYN-16 — probability-sum-valid.
 *
 * Fixed (non-attribute) probabilities among the outgoing flows of one
 * gateway/state must sum to <= 1.0. Flag if the sum exceeds 1.0, or if
 * more than one flow in the group omits `probability` (ambiguous which
 * one absorbs the implicit remainder).
 *
 * A flow using `probabilityAttribute` instead (implicit-rules.md Table C:
 * "named/dynamic distribution") is deliberately fixed in a different sense
 * — its actual value is only known at simulation time, not at design time
 * — so it counts as neither "fixed" (it contributes nothing to the sum,
 * since there's no design-time number to add) nor "unfixed" (it doesn't
 * compete for the implicit 1.0-minus-sum remainder the way an omitted
 * `probability` does).
 */
module.exports = function() {

  function check(node, reporter) {

    if (!isBranchingNode(node)) {
      return;
    }

    const outgoing = (node.outgoing || []).filter((flow) => !!getExtension(flow, 'synthea:ProbabilityConfig'));

    if (outgoing.length < 2) {
      return;
    }

    let sum = 0;
    let unfixedCount = 0;

    outgoing.forEach((flow) => {
      const probability = getExtension(flow, 'synthea:ProbabilityConfig');
      const raw = probability.probability;

      if (probability.probabilityAttribute) {
        return;
      }

      // `probability` is a Real in the schema, so moddle reads it as a number;
      // parseFloat keeps this tolerant of string values from older descriptors.
      if (raw === undefined || raw === null || raw === '') {
        unfixedCount += 1;
      } else {
        sum += parseFloat(raw);
      }
    });

    if (sum > 1.0 + 1e-9) {
      reporter.report(
        node.id,
        'distributed_transition probabilities out of this node sum to ' + sum.toFixed(3) + ', which exceeds 1.0.'
      );
    }

    if (unfixedCount > 1) {
      reporter.report(
        node.id,
        unfixedCount + ' outgoing flows from this node have no fixed probability — only the last unweighted ' +
        'branch may implicitly absorb the 1.0 - sum remainder.'
      );
    }
  }

  function isBranchingNode(node) {
    return is(node, 'bpmn:ExclusiveGateway') ||
      is(node, 'bpmn:Task') ||
      is(node, 'bpmn:IntermediateCatchEvent') ||
      is(node, 'bpmn:IntermediateThrowEvent');
  }

  return { check };
};
