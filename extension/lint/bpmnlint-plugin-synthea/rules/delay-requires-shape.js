const { is } = require('../lib/utils');

/**
 * SYN-17 — Delay state requires a synthea:DelayConfig with delayShape.
 *
 * A synthea:StateTypeConfig with stateType="Delay" corresponds to a
 * Synthea Delay state, which always waits according to exactly one of
 * exact/range/distribution. Without a DelayConfig — or one whose
 * delayShape is unset — the state has no wait duration and cannot
 * round-trip into a real Synthea module.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:StateTypeConfig')) {
      return;
    }

    if (node.stateType !== 'Delay') {
      return;
    }

    const delayConfig = findDelayConfig(node);

    if (!delayConfig || !delayConfig.delayShape) {
      reporter.report(
        nearestReportableId(node),
        'stateType is "Delay" but no synthea:DelayConfig with a delayShape was found — a Delay state needs a wait duration.'
      );
    }
  }

  function findDelayConfig(stateTypeConfig) {
    const extensionElements = stateTypeConfig.$parent;

    if (!extensionElements || !extensionElements.values) {
      return null;
    }

    return extensionElements.values.find((v) => is(v, 'synthea:DelayConfig')) || null;
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
