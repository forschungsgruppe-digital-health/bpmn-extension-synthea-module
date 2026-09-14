const { is } = require('../lib/utils');

/**
 * SYN-13 — Guard state requires a synthea:GuardConfig.
 *
 * A synthea:StateTypeConfig with stateType="Guard" describes a Synthea
 * Guard state, which by definition blocks until its `allow` condition
 * becomes true. A Guard without any GuardConfig (or with an empty one)
 * has no condition to wait on and cannot correspond to a valid Synthea
 * module — this is exactly the kind of cross-element constraint the
 * XSD cannot express, since it only knows the flat attribute shape.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:StateTypeConfig')) {
      return;
    }

    if (node.stateType !== 'Guard') {
      return;
    }

    const guardConfig = findGuardConfig(node);

    if (!guardConfig) {
      reporter.report(
        nearestReportableId(node),
        'stateType is "Guard" but no synthea:GuardConfig was found on this element — a Guard state needs an allow condition to wait on.'
      );
    }
  }

  function findGuardConfig(stateTypeConfig) {
    const extensionElements = stateTypeConfig.$parent;

    if (!extensionElements || !extensionElements.values) {
      return null;
    }

    return extensionElements.values.find((v) => is(v, 'synthea:GuardConfig')) || null;
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
