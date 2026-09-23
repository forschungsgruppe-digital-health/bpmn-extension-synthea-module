const { is } = require('../lib/utils');

/**
 * SYN-23 — delayShape="RANGE" requires delayValueHigh.
 *
 * Per the Synthea wiki, a v1 "range" delay needs both a low and a high
 * value. synthea:DelayConfig models this as delayValue (low) +
 * delayValueHigh (high) — without delayValueHigh, a RANGE delay is
 * missing half its definition and cannot round-trip into a real Synthea
 * module.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:DelayConfig')) {
      return;
    }

    if (node.delayValueHigh) {
      return;
    }

    if (node.delayShape === 'RANGE') {
      reporter.report(
        nearestReportableId(node),
        'delayShape is "RANGE" but delayValueHigh is not set — a range delay needs both a low and a high value.'
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
