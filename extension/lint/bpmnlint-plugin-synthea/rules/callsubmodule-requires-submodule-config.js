const { is } = require('../lib/utils');

/**
 * SYN-15 — CallSubmodule state requires a synthea:SubmoduleConfig.
 *
 * A synthea:StateTypeConfig with stateType="CallSubmodule" corresponds
 * to a Synthea CallSubmodule state, which always names the submodule it
 * invokes via a "submodule" path (e.g. "medications/otc_pain_reliever").
 * Without a SubmoduleConfig — or with one whose submodule is empty —
 * the call has no target and cannot round-trip into a real Synthea
 * module.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:StateTypeConfig')) {
      return;
    }

    if (node.stateType !== 'CallSubmodule') {
      return;
    }

    const submoduleConfig = findSubmoduleConfig(node);

    if (!submoduleConfig || !submoduleConfig.submodule) {
      reporter.report(
        nearestReportableId(node),
        'stateType is "CallSubmodule" but no synthea:SubmoduleConfig with a submodule path was found — a CallSubmodule state needs a target to call.'
      );
    }
  }

  function findSubmoduleConfig(stateTypeConfig) {
    const extensionElements = stateTypeConfig.$parent;

    if (!extensionElements || !extensionElements.values) {
      return null;
    }

    return extensionElements.values.find((v) => is(v, 'synthea:SubmoduleConfig')) || null;
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
