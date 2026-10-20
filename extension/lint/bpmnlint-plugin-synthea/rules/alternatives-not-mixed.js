const { is, getExtension } = require('../lib/utils');

/**
 * SYN-32 — alternatives are not mixed.
 *
 * Several fields of the extension are alternatives; Synthea takes one of them and the converter
 * would drop or reject the rest. The panel clears the other fields when the choice changes
 * ("Value as", "Probability as"); this rule catches what a hand-edited diagram still contains:
 *
 *  - probabilityConfig: a fixed probability together with a probabilityAttribute
 *  - setAttributeConfig: more than one of value / valueAttribute / distribution, or fields of a
 *    kind other than the chosen valueKind
 *  - delayConfig: delayValueHigh on an exact delay
 *  - valueConfig: valueHigh on an exact value
 *  - encounterContext: wellness together with an encounterClass
 *  - an element with a code and a referencedByAttributeConfig (an end state or Death names the
 *    ended entity in one way only; the attribute wins)
 */
const DISTRIBUTION_FIELDS = [
  'distribution', 'distributionRound', 'distributionValue', 'distributionMean',
  'distributionStandardDeviation', 'distributionMin', 'distributionMax', 'distributionLow', 'distributionHigh'
];

const isSet = (v) => v !== undefined && v !== null && v !== '' && v !== false;

module.exports = function() {

  function check(node, reporter) {

    if (is(node, 'synthea:ProbabilityConfig') && isSet(node.probability) && isSet(node.probabilityAttribute)) {
      report(reporter, node, 'has both a probability and a probabilityAttribute — choose one.');
    }

    if (is(node, 'synthea:SetAttributeConfig')) {
      const present = {
        VALUE: isSet(node.value),
        ATTRIBUTE: isSet(node.valueAttribute),
        DISTRIBUTION: DISTRIBUTION_FIELDS.some((f) => isSet(node[f]))
      };
      const kinds = Object.keys(present).filter((k) => present[k]);
      const others = node.valueKind ? kinds.filter((k) => k !== node.valueKind) : kinds.length > 1 ? kinds : [];
      if (others.length) {
        report(reporter, node, `sets its value in more than one way (${kinds.join(', ')}) — keep only the one chosen as "Value as".`);
      }
    }

    if (is(node, 'synthea:DelayConfig') && node.delayShape !== 'RANGE' && isSet(node.delayValueHigh)) {
      report(reporter, node, 'has delayValueHigh on an exact delay — set delayShape to RANGE or remove it.');
    }

    if (is(node, 'synthea:ValueConfig') && node.valueShape !== 'RANGE' && isSet(node.valueHigh)) {
      report(reporter, node, 'has valueHigh on an exact value — set valueShape to RANGE or remove it.');
    }

    if (is(node, 'synthea:EncounterContext') && node.wellness && isSet(node.encounterClass)) {
      report(reporter, node, 'is a wellness encounter and has an encounterClass — an encounter is one or the other.');
    }

    if (node.extensionElements && getExtension(node, 'synthea:ReferencedByAttributeConfig')?.attribute) {
      const state = getExtension(node, 'synthea:StateTypeConfig');
      if (state && isSet(state.code)) {
        reporter.report(node.id, 'refers to an attribute (referencedByAttributeConfig) and also has a code — Synthea takes one or the other, the code is not written.');
      }
    }
  }

  function report(reporter, node, message) {
    let current = node.$parent;

    while (current && !current.id) {
      current = current.$parent;
    }

    reporter.report(current ? current.id : undefined, `${node.$type.replace('synthea:', '')} ${message}`);
  }

  return { check };
};
