const { is } = require('../lib/utils');

const COMBINATOR_CONDITION_TYPES = ['And', 'Or', 'At Least', 'At Most'];

/**
 * SYN-14 — GuardConfig.allow requires a non-empty condition.
 *
 * Mirrors negate-requires-condition (SYN-12), but for the nested
 * Condition under synthea:GuardConfig.allow instead of the flow-level
 * synthea:ConditionConfig. synthea:Condition itself has no `id` (it is
 * a nested value, not a flow node), so the report is attached to the
 * nearest ancestor that has one (the gateway the GuardConfig hangs off).
 *
 * "Non-empty" used to mean conditionType+operator, back when Attribute
 * was the only real conditionType — now that combinator types (And/Or/
 * At Least/At Most) carry a `conditions` list instead of operator, and
 * True/False/Gender/etc. don't use operator either, conditionType alone
 * (the one universal signal that something was actually configured) is
 * the right check; combinators additionally need a non-empty `conditions`
 * list, since an And/Or with nothing to combine is just as empty as a
 * missing allow.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:GuardConfig')) {
      return;
    }

    const allow = node.allow;

    if (!allow || !allow.conditionType) {
      reporter.report(
        nearestReportableId(node),
        'synthea:GuardConfig is present but allow is missing or empty (no conditionType set) — a Guard needs a condition to evaluate.'
      );
      return;
    }

    if (COMBINATOR_CONDITION_TYPES.includes(allow.conditionType) && !(allow.conditions && allow.conditions.length)) {
      reporter.report(
        nearestReportableId(node),
        `allow has conditionType "${allow.conditionType}" but no conditions to combine — a combinator needs at least one nested condition.`
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
