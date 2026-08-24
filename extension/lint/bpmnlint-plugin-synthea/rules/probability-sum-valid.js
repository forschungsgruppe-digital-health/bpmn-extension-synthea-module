const { is, getExtension } = require('../lib/utils');

/**
 * SYN-14 — probability-sum-valid.
 *
 * Fixed (non-attribute) probabilities among the outgoing flows of one
 * gateway/state must sum to <= 1.0. Flag if the sum exceeds 1.0, or if
 * more than one flow in the group omits `probability` (ambiguous which
 * one absorbs the implicit remainder).
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

      // bpmn-moddle does not coerce custom-extension "Float" attributes to
      // Number — they come back as strings straight from the XML, so this
      // must parse explicitly or `sum +=` silently does string
      // concatenation instead of addition.
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
