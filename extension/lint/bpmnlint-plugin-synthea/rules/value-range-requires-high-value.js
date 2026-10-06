const { is } = require('../lib/utils');

/**
 * SYN-29 — a RANGE value needs valueHigh, an EXACT value must not have one.
 *
 * synthea:ValueConfig mirrors the exact/range choice Synthea has on Observation,
 * Symptom and Death: EXACT is one number (`value`), RANGE a low/high pair
 * (`value`, `valueHigh`). Same idea as delay-range-requires-high-value for
 * delays.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:ValueConfig')) {
      return;
    }

    const hasHigh = node.valueHigh !== undefined && node.valueHigh !== '';

    if (node.valueShape === 'RANGE' && !hasHigh) {
      reporter.report(
        nearestReportableId(node),
        'valueShape is "RANGE" but valueHigh is not set — a range needs both a low and a high value.'
      );
    }

    if (node.valueShape !== 'RANGE' && hasHigh) {
      reporter.report(
        nearestReportableId(node),
        'valueHigh is set but valueShape is not "RANGE" — set the shape to RANGE or remove valueHigh.'
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
