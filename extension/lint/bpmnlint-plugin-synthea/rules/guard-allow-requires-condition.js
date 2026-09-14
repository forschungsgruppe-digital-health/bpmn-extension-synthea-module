const { is } = require('../lib/utils');

/**
 * SYN-14 — GuardConfig.allow requires a non-empty condition.
 *
 * Mirrors negate-requires-condition (SYN-12), but for the nested
 * Condition under synthea:GuardConfig.allow instead of the flow-level
 * synthea:ConditionConfig. synthea:Condition itself has no `id` (it is
 * a nested value, not a flow node), so the report is attached to the
 * nearest ancestor that has one (the gateway the GuardConfig hangs off).
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:GuardConfig')) {
      return;
    }

    const allow = node.allow;

    if (!allow || !(allow.conditionType && allow.operator)) {
      reporter.report(
        nearestReportableId(node),
        'synthea:GuardConfig is present but allow is missing or empty (no conditionType/operator) — a Guard needs a condition to evaluate.'
      );
    }
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
