const { is } = require('../lib/utils');

const VALID_STATE_TYPES = ['ConditionEnd', 'AllergyEnd', 'MedicationEnd', 'CarePlanEnd', 'DeviceEnd', 'Death'];

/**
 * SYN-33 — ReferencedByAttributeConfig.attribute is only meaningful on
 * ConditionEnd / AllergyEnd / MedicationEnd / CarePlanEnd / DeviceEnd /
 * Death states (warn).
 *
 * Per the Synthea wiki, "referenced_by_attribute" is documented on exactly
 * these six states (confirmed against the States wiki page) as one of
 * several alternative ways to point back at an entity a corresponding
 * *Onset/Order/Start state previously recorded via "assign_to_attribute" —
 * the counterpart to synthea:AssignToAttributeConfig (SYN-22), which covers
 * the "assign" side (ConditionOnset/AllergyOnset/MedicationOrder/
 * CarePlanStart/Device). synthea:ReferencedByAttributeConfig can technically
 * be attached to any element per the descriptor, so a value on a state with
 * a different stateType is very likely a modeling mistake — hence a
 * warning, not a hard error, mirroring assign-to-attribute-requires-valid-state.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:ReferencedByAttributeConfig')) {
      return;
    }

    if (!node.attribute) {
      return;
    }

    const stateTypeConfig = findStateTypeConfig(node);
    const stateType = stateTypeConfig ? stateTypeConfig.stateType : undefined;

    if (!VALID_STATE_TYPES.includes(stateType)) {
      reporter.report(
        nearestReportableId(node),
        `attribute is set but this element's stateType is "${stateType || '(unset)'}" — referenced_by_attribute is only meaningful on ${VALID_STATE_TYPES.join('/')} states in Synthea.`
      );
    }
  }

  function findStateTypeConfig(referencedByAttributeConfig) {
    const extensionElements = referencedByAttributeConfig.$parent;

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
