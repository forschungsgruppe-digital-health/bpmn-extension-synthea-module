const { is } = require('../lib/utils');

/**
 * SYN-16 — distributionKind requires delayShape="DISTRIBUTION".
 *
 * In Synthea, "kind" is only meaningful inside a Delay state's
 * "distribution" object — it has no counterpart under "exact" or
 * "range". synthea:DelayConfig flattens these three variants into one
 * type for the XML-attribute world, so the moddle descriptor cannot by
 * itself forbid setting distributionKind alongside delayShape="EXACT"
 * or "RANGE" — that cross-attribute constraint belongs here.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:DelayConfig')) {
      return;
    }

    if (node.distributionKind && node.delayShape !== 'DISTRIBUTION') {
      reporter.report(
        nearestReportableId(node),
        `distributionKind is set to "${node.distributionKind}" but delayShape is "${node.delayShape || '(unset)'}" — distributionKind is only meaningful when delayShape is "DISTRIBUTION".`
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
