const { is } = require('../lib/utils');

const TWO_PARAMETER_DISTRIBUTION_KINDS = ['GAUSSIAN', 'UNIFORM'];

/**
 * SYN-23 — delayShape="RANGE", or distributionKind="GAUSSIAN"/"UNIFORM",
 * requires delayValueHigh.
 *
 * Per the Synthea wiki, a v1 "range" delay needs low+high, and a v2
 * "distribution" delay needs two parameters for GAUSSIAN (mean+standard
 * deviation) and UNIFORM (low+high) — only EXACT and EXPONENTIAL need a
 * single number. synthea:DelayConfig flattens all of these into
 * delayValue (the first/primary number) + delayValueHigh (the second, only
 * meaningful for the three two-parameter cases above) — without
 * delayValueHigh, a RANGE or GAUSSIAN/UNIFORM delay is missing half its
 * definition and cannot round-trip into a real Synthea module.
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
      return;
    }

    if (node.delayShape === 'DISTRIBUTION' && TWO_PARAMETER_DISTRIBUTION_KINDS.includes(node.distributionKind)) {
      reporter.report(
        nearestReportableId(node),
        `distributionKind is "${node.distributionKind}" but delayValueHigh is not set — ${node.distributionKind === 'GAUSSIAN' ? 'a Gaussian distribution needs a standard deviation' : 'a uniform distribution needs both a low and a high value'}.`
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
