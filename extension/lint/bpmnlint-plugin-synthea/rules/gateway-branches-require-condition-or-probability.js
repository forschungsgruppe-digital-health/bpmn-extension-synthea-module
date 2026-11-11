const { is, getExtension } = require('../lib/utils');

/**
 * SYN-27 — gateway-branches-require-condition-or-probability.
 *
 * An exclusive gateway with several outgoing flows becomes a GMF
 * conditional_transition or distributed_transition (implicit-rules.md,
 * Table C). That only works if the branches say how to choose:
 * `synthea:conditionConfig` (structured condition) or `synthea:probabilityConfig`
 * (fixed probability or probabilityAttribute) on each flow. The native BPMN
 * `name`/`conditionExpression` is only a label and cannot be translated.
 *
 * At most one outgoing flow may omit both — it is the fallback of a conditional
 * transition (the BPMN default flow) or the probability remainder of a
 * distributed one. Two or more unconfigured flows leave the converter with no
 * way to tell which branch is which.
 *
 * Outgoing flows are collected from the parent process rather than from
 * `node.outgoing`, which only exists if the file carries explicit
 * <bpmn:outgoing> children.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'bpmn:ExclusiveGateway')) {
      return;
    }

    const outgoing = outgoingFlows(node);

    if (outgoing.length < 2) {
      return;
    }

    const unconfigured = outgoing.filter((flow) => !hasBranchConfig(flow));

    if (unconfigured.length <= 1) {
      return;
    }

    reporter.report(
      node.id,
      unconfigured.length + ' of ' + outgoing.length + ' outgoing flows (' +
      unconfigured.map((flow) => flow.id).join(', ') + ') have neither ' +
      'synthea:conditionConfig nor synthea:probabilityConfig — only one flow (the default/fallback or the ' +
      'probability remainder) may omit it, otherwise no GMF transition can be derived.'
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
