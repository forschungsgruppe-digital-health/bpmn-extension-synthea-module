const { is } = require('../lib/utils');

/**
 * SYN-12 — `negate` requires a condition.
 *
 * negate="true" on an empty synthea:Condition (no conditionType/operator)
 * has nothing to negate. synthea:Condition itself has no `id` (it's a
 * nested value, not a flow node), so the report is attached to the
 * nearest ancestor that has one (the enclosing sequence flow).
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:Condition')) {
      return;
    }

    if (node.negate && !(node.conditionType && node.operator)) {
      reporter.report(
        nearestReportableId(node),
        'negate is set on a synthea:Condition but conditionType/operator are empty — negate on an empty condition has nothing to negate.'
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
