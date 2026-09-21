const { is } = require('../lib/utils');

/**
 * SYN-12 — `negate` requires a condition.
 *
 * negate="true" on an empty synthea:Condition (no conditionType/operator)
 * has nothing to negate. synthea:Condition itself has no `id` (it's a
 * nested value, not a flow node), so the report is attached to the
 * nearest ancestor that has one (the enclosing sequence flow).
 *
 * Note on `negate` itself: real Synthea has no negate/not boolean at all —
 * negation is expressed only via a separate `Not` condition wrapping the
 * inner one. `negate="true"` here is a documented bridging construct,
 * defined as equivalent to that `Not` wrapper (see implicit-rules.md
 * Section A); this rule only guards against an empty/meaningless negation,
 * it does not — and cannot — validate the Not-equivalence itself, since
 * that's an export-time (tools/bpmn2gmf) concern, not a structural one.
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
