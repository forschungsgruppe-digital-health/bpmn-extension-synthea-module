const { is } = require('../lib/utils');

/**
 * SYN-21 — SetAttribute state requires a synthea:SetAttributeConfig with an attribute name.
 *
 * A synthea:StateTypeConfig with stateType="SetAttribute" corresponds to a
 * Synthea SetAttribute state. synthea:SetAttributeConfig carries both the
 * target attribute name and the value to assign it — value is optional
 * here too (Synthea itself defaults to null when omitted, and also
 * supports valueCode/range/expression instead of a plain value, which
 * this extension doesn't model), but attribute is mandatory: without it,
 * the state doesn't say what it's setting at all.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:StateTypeConfig')) {
      return;
    }

    if (node.stateType !== 'SetAttribute') {
      return;
    }

    const setAttributeConfig = findSetAttributeConfig(node);

    if (!setAttributeConfig || !setAttributeConfig.attribute) {
      reporter.report(
        nearestReportableId(node),
        'stateType is "SetAttribute" but no synthea:SetAttributeConfig with an attribute name was found — a SetAttribute state needs to name what it sets.'
      );
    }
  }

  function findSetAttributeConfig(stateTypeConfig) {
    const extensionElements = stateTypeConfig.$parent;

    if (!extensionElements || !extensionElements.values) {
      return null;
    }

    return extensionElements.values.find((v) => is(v, 'synthea:SetAttributeConfig')) || null;
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
