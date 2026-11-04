const { is, getExtension } = require('../lib/utils');

/**
 * inclusive-branches-require-condition-or-probability.
 *
 * Every branch of an inclusive gateway is decided on its own, so none, some or all of them can
 * happen (tools/bpmn2gmf/gateways.mjs). The converter makes one deciding state per branch, and that
 * state needs the branch's own `synthea:conditionConfig` or `synthea:probabilityConfig`. Unlike an
 * exclusive gateway there is no fallback or remainder branch that may omit it: a branch without it
 * cannot be decided.
 *
 * Outgoing flows are collected from the parent process rather than from `node.outgoing`, which
 * only exists if the file carries explicit <bpmn:outgoing> children.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'bpmn:InclusiveGateway')) {
      return;
    }

    const outgoing = outgoingFlows(node);

    if (outgoing.length < 2) {
      return;
    }

    const unconfigured = outgoing.filter((flow) => !hasBranchConfig(flow));

    if (!unconfigured.length) {
      return;
    }

    reporter.report(
      node.id,
      unconfigured.length + ' of ' + outgoing.length + ' outgoing flows (' +
      unconfigured.map((flow) => flow.id).join(', ') + ') have neither ' +
      'synthea:conditionConfig nor synthea:probabilityConfig — every branch of an inclusive gateway is ' +
      'decided on its own and needs one of them.'
    );
  }

  function outgoingFlows(node) {
    const siblings = (node.$parent && node.$parent.flowElements) || [];
    const fromParent = siblings.filter((el) => is(el, 'bpmn:SequenceFlow') && el.sourceRef === node);

    return fromParent.length ? fromParent : (node.outgoing || []);
  }

  function hasBranchConfig(flow) {
    const condition = getExtension(flow, 'synthea:ConditionConfig');

    if (condition && condition.condition && condition.condition.conditionType) {
      return true;
    }

    const probability = getExtension(flow, 'synthea:ProbabilityConfig');

    return !!probability && (
      (probability.probability !== undefined && probability.probability !== '') ||
      !!probability.probabilityAttribute
    );
  }

  return { check };
};
