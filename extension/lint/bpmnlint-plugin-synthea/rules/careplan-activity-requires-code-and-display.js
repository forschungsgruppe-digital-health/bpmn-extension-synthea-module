const { is } = require('../lib/utils');

/**
 * SYN-30 — a care plan activity needs both a SNOMED code and its display text.
 *
 * synthea:CarePlanActivity lists the activities of a CarePlanStart (Synthea's
 * `activities`, "valid SNOMED codes"). The code system is fixed to SNOMED-CT, so
 * only `code` and `codeDisplay` are modeled; an entry with one of them is incomplete.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:CarePlanActivity')) {
      return;
    }

    const missing = ['code', 'codeDisplay'].filter((field) => !node[field]);

    if (missing.length) {
      reporter.report(
        nearestReportableId(node),
        `carePlanActivity is missing ${missing.join(' and ')} — an activity needs a SNOMED code and its display text.`
      );
    }
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
