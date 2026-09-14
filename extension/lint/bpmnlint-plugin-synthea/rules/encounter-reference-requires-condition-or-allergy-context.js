const { is } = require('../lib/utils');

/**
 * SYN-18 — EncounterReference.targetEncounter is only meaningful on
 * ConditionOnset / AllergyOnset states (warn).
 *
 * In Synthea, "target_encounter" is documented and used on
 * ConditionOnset and AllergyOnset states only. synthea:EncounterReference
 * can technically be attached to any Intermediate Event per the
 * descriptor (moddle has no per-stateType attachment constraint), so a
 * targetEncounter on a state with a different stateType is very likely
 * a modeling mistake rather than a deliberate, valid use — hence a
 * warning, not a hard error, since the stateType/EncounterReference
 * association can only be inferred, not guaranteed, from the diagram.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:EncounterReference')) {
      return;
    }

    if (!node.targetEncounter) {
      return;
    }

    const stateTypeConfig = findStateTypeConfig(node);
    const stateType = stateTypeConfig ? stateTypeConfig.stateType : undefined;

    if (stateType !== 'ConditionOnset' && stateType !== 'AllergyOnset') {
      reporter.report(
        nearestReportableId(node),
        `targetEncounter is set but this element's stateType is "${stateType || '(unset)'}" — target_encounter is only meaningful on ConditionOnset/AllergyOnset states in Synthea.`
      );
    }
  }

  function findStateTypeConfig(encounterReference) {
    const extensionElements = encounterReference.$parent;

    if (!extensionElements || !extensionElements.values) {
      return null;
    }

    return extensionElements.values.find((v) => is(v, 'synthea:StateTypeConfig')) || null;
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
