const { is } = require('../lib/utils');

/**
 * SYN-19 — WellnessConfig requires stateType Encounter/EncounterEnd on
 * the same element.
 *
 * Encounter/EncounterEnd are modeled as ordinary flow nodes (Task /
 * EndEvent / SubProcess) carrying a synthea:StateTypeConfig, the same
 * as every other state type — not as a separate TextAnnotation. So
 * synthea:WellnessConfig sits on the same element as its
 * StateTypeConfig, exactly like synthea:DelayConfig does for Delay
 * states, and this rule only needs a same-element check — no
 * cross-element reference or association lookup required.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:WellnessConfig')) {
      return;
    }

    const stateType = findStateType(node);

    if (stateType !== 'Encounter' && stateType !== 'EncounterEnd') {
      reporter.report(
        nearestReportableId(node),
        `synthea:WellnessConfig is set, but this element's stateType is "${stateType || '(unset)'}" — wellness only applies to Encounter/EncounterEnd states in Synthea.`
      );
    }
  }

  function findStateType(wellnessConfig) {
    const extensionElements = wellnessConfig.$parent;

    if (!extensionElements || !extensionElements.values) {
      return null;
    }

    const stateTypeConfig = extensionElements.values.find((v) => is(v, 'synthea:StateTypeConfig'));

    return stateTypeConfig ? stateTypeConfig.stateType : null;
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
