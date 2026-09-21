const { is } = require('../lib/utils');

/**
 * SYN-20 — Counter state requires a synthea:CounterConfig with attribute and action.
 *
 * A synthea:StateTypeConfig with stateType="Counter" corresponds to a
 * Synthea Counter state, which always names the attribute it counts and
 * whether it increments or decrements ("action" is a required choice per
 * the Synthea wiki, not optional like "amount", which defaults to 1).
 * Without a CounterConfig — or one missing attribute/action — the state
 * has nothing to count and cannot round-trip into a real Synthea module.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:StateTypeConfig')) {
      return;
    }

    if (node.stateType !== 'Counter') {
      return;
    }

    const counterConfig = findCounterConfig(node);

    if (!counterConfig || !counterConfig.attribute || !counterConfig.action) {
      reporter.report(
        nearestReportableId(node),
        'stateType is "Counter" but no synthea:CounterConfig with both attribute and action was found — a Counter state needs to know what to count and which direction.'
      );
    }
  }

  function findCounterConfig(stateTypeConfig) {
    const extensionElements = stateTypeConfig.$parent;

    if (!extensionElements || !extensionElements.values) {
      return null;
    }

    return extensionElements.values.find((v) => is(v, 'synthea:CounterConfig')) || null;
  }

  function nearestReportableId(node) {
    let current = node.$parent;

    while (current && !current.id) {
      current = current.$parent;
    }

    return current ? current.id : undefined;
  }

  return { check };
};
