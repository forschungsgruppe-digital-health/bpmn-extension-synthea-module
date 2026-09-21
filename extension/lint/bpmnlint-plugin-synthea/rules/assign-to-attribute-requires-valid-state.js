const { is } = require('../lib/utils');

const VALID_STATE_TYPES = ['ConditionOnset', 'AllergyOnset', 'MedicationOrder', 'CarePlanStart', 'Device'];

/**
 * SYN-22 — AssignToAttributeConfig.attribute is only meaningful on
 * ConditionOnset / AllergyOnset / MedicationOrder / CarePlanStart / Device
 * states (warn).
 *
 * Per the Synthea wiki, "assign_to_attribute" is not its own state type —
 * it's an optional field documented on exactly these five clinical states
 * (solving the start/end pairing-by-order ambiguity noted in
 * implicit-rules.md's open points: a later End state can reference the
 * attribute instead of relying on path order). synthea:AssignToAttributeConfig
 * can technically be attached to any element per the descriptor, so a value
 * on a state with a different stateType is very likely a modeling mistake —
 * hence a warning, not a hard error, mirroring
 * encounter-reference-requires-condition-or-allergy-context (SYN-18).
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:AssignToAttributeConfig')) {
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
        `attribute is set but this element's stateType is "${stateType || '(unset)'}" — assign_to_attribute is only meaningful on ${VALID_STATE_TYPES.join('/')} states in Synthea.`
      );
    }
  }

  function findStateTypeConfig(assignToAttributeConfig) {
    const extensionElements = assignToAttributeConfig.$parent;

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
