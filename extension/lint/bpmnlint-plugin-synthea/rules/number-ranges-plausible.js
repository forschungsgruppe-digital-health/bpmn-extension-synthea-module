const { is } = require('../lib/utils');
const { nearestReportableId, isSet, numberOf } = require('../lib/values');

/**
 * SYN-40 — number-ranges-plausible.
 *
 * Numbers that are out of range for what they mean (Synthea wiki, Generic Module Framework):
 *  - a probability, a probability default and an allergy reaction severity are between 0 and 1;
 *  - a range has a low value that is not above the high value (delay, value, distribution);
 *  - a Gaussian distribution has a standard deviation of at least 0 and min <= max, an exponential
 *    one a mean above 0;
 *  - refills are not negative; a dosage amount, frequency and period are above 0.
 *
 * Probabilities that sum to more than 1 are SYN-16. The wiki does not say what Synthea does with
 * the numbers above, so this is a warning: it points at what is almost certainly a typo.
 *
 * Left out on purpose: "a Symptom value is between 0 and 100". The wiki says so (and contradicts
 * itself, "1-100" in one place), but the lung cancer module of Synthea itself uses 250 and 350, and
 * the pathway in lung-cancer/ uses them as well.
 */
module.exports = function() {

  function check(node, reporter) {
    const id = nearestReportableId(node);
    const warn = (message) => reporter.report(id, message);

    const outside01 = (name, v) => {
      const n = numberOf(v);

      if (n !== undefined && !(n >= 0 && n <= 1)) {
        warn(`${name} is ${v}, but it has to be between 0 and 1.`);
      }
    };

    if (is(node, 'synthea:ProbabilityConfig')) {
      outside01('The probability', node.probability);
      outside01('The probability default', node.probabilityDefault);
    }

    if (is(node, 'synthea:AllergyReaction')) {
      for (const level of [ 'None', 'Mild', 'Moderate', 'Severe' ]) {
        outside01(`The ${level.toLowerCase()} severity`, node[`severity${level}`]);
      }
    }

    if (is(node, 'synthea:DelayConfig') && node.delayShape === 'RANGE') {
      const low = numberOf(node.delayValue);
      const high = numberOf(node.delayValueHigh);

      if (low !== undefined && high !== undefined && low > high) {
        warn(`The delay range goes from ${low} to ${high}: the low value is above the high value.`);
      }
    }

    if (is(node, 'synthea:ValueConfig')) {
      if (node.valueShape === 'RANGE' && isSet(node.value) && isSet(node.valueHigh) && node.value > node.valueHigh) {
        warn(`The value range goes from ${node.value} to ${node.valueHigh}: the low value is above the high value.`);
      }

    }

    if (is(node, 'synthea:SetAttributeConfig') && node.distribution) {
      const n = (v) => (isSet(v) ? Number(v) : undefined);

      if (node.distribution === 'UNIFORM' && n(node.distributionLow) > n(node.distributionHigh)) {
        warn(`The uniform distribution goes from ${node.distributionLow} to ${node.distributionHigh}: low is above high.`);
      }

      if (node.distribution === 'GAUSSIAN') {
        if (n(node.distributionStandardDeviation) < 0) {
          warn(`The standard deviation is ${node.distributionStandardDeviation}; it cannot be negative.`);
        }

        if (n(node.distributionMin) > n(node.distributionMax)) {
          warn(`The Gaussian distribution has min ${node.distributionMin} above max ${node.distributionMax}.`);
        }
      }

      if (node.distribution === 'EXPONENTIAL' && n(node.distributionMean) <= 0) {
        warn(`The exponential distribution has a mean of ${node.distributionMean}; it has to be above 0.`);
      }
    }

    if (is(node, 'synthea:PrescriptionConfig')) {
      if (isSet(node.refills) && node.refills < 0) {
        warn(`The number of refills is ${node.refills}; it cannot be negative.`);
      }

      for (const [ field, name ] of [ [ 'dosageAmount', 'amount' ], [ 'dosageFrequency', 'frequency' ], [ 'dosagePeriod', 'period' ] ]) {
        if (isSet(node[field]) && node[field] <= 0) {
          warn(`The dosage ${name} is ${node[field]}; it has to be above 0.`);
        }
      }
    }
  }

  return { check };
};
