const { is, getExtension } = require('../lib/utils');

/**
 * SYN-35 — exclusive-gateway-requires-default-flow.
 *
 * An exclusive gateway whose branches carry a `synthea:conditionConfig` becomes a GMF
 * conditional_transition: Synthea takes the first branch whose condition is true. If none is true
 * it silently moves to its default Terminal state, and the patient's pathway ends without anyone
 * having decided that. The diagram must say what happens instead: one outgoing flow is the
 * BPMN default flow (`default` attribute of the gateway) and carries no condition, it is the
 * "else" branch.
 *
 * Reported when the gateway has no default flow, or when the default flow also has a condition
 * (a default flow is taken when no other condition holds, so a condition on it contradicts that).
 *
 * Gateways whose branches use probabilities (distributed_transition) are not affected: the
 * probabilities cover every case. Outgoing flows are collected from the parent process rather than
 * from `node.outgoing`, which only exists if the file carries explicit <bpmn:outgoing> children.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'bpmn:ExclusiveGateway')) {
      return;
    }

    const outgoing = outgoingFlows(node);

    if (outgoing.length < 2 || !outgoing.some(hasCondition)) {
      return;
    }

    const fallback = node.default;

    if (!fallback || outgoing.indexOf(fallback) === -1) {
      reporter.report(
        node.id,
        'The branches have conditions, but the gateway has no default flow. If no condition is true, ' +
        'Synthea ends the pathway in its default Terminal state. Mark one outgoing flow as the default ' +
        'flow (the "else" branch) and remove its condition.'
      );

      return;
    }

    if (hasCondition(fallback)) {
      reporter.report(
        node.id,
        'The default flow ' + fallback.id + ' also has a synthea:conditionConfig. A default flow is the ' +
        '"else" branch, taken when no other condition is true, so remove the condition from it.'
      );
    }
  }

  function outgoingFlows(node) {
    const siblings = (node.$parent && node.$parent.flowElements) || [];
    const fromParent = siblings.filter((el) => is(el, 'bpmn:SequenceFlow') && el.sourceRef === node);

    return fromParent.length ? fromParent : (node.outgoing || []);
  }

  function hasCondition(flow) {
    const condition = getExtension(flow, 'synthea:ConditionConfig');

    return !!(condition && condition.condition && condition.condition.conditionType);
  }

  return { check };
};
