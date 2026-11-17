const { is, getStateType } = require('../lib/utils');
const { nearestReportableId, isSet } = require('../lib/values');

/**
 * SYN-43 — observation-condition-needs-observation.
 *
 * An Observation condition that compares a value (not "is nil" / "is not nil") reads an observation
 * the patient already has. The wiki says the GMF raises an exception when there is none yet. If no
 * state of this diagram records an observation with that code, the module can only work if another
 * module of the same run records it before. That can be intended (the lung cancer pathway reads
 * values that other modules write), so this is a note to check, and a warning only.
 *
 * Matched by code (system and code) against the code of Observation states and of the observations
 * inside a MultiObservation or DiagnosticReport; a condition that names an attribute instead of a
 * code is not checked.
 */
const OBSERVATION_STATES = [ 'Observation', 'MultiObservation', 'DiagnosticReport' ];
const NIL = [ 'is nil', 'is not nil' ];

module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'bpmn:Definitions')) {
      return;
    }

    const recorded = new Set();
    const conditions = [];
    const stack = [ ...(node.rootElements || []) ];

    while (stack.length) {
      const el = stack.pop();

      stack.push(...(el.flowElements || []));

      const values = (el.extensionElements && el.extensionElements.values) || [];

      if (OBSERVATION_STATES.includes(getStateType(el))) {
        for (const v of values) {
          if (is(v, 'synthea:StateTypeConfig') && isSet(v.code)) {
            recorded.add(`${v.codeSystem}|${v.code}`);
          }
          if (is(v, 'synthea:ReportObservation') && isSet(v.code)) {
            recorded.add(`${v.codeSystem || 'http://loinc.org'}|${v.code}`);
          }
        }
      }
    }

    // conditions are nested children of extension elements: walk the whole tree for them
    (function walk(obj) {
      if (!obj || typeof obj !== 'object' || !obj.$type) {
        return;
      }
      if (is(obj, 'synthea:Condition') && obj.conditionType === 'Observation') {
        conditions.push(obj);
      }
      for (const key of Object.keys(obj.$descriptor.propertiesByName || {})) {
        const value = obj[key];

        if (key === '$parent' || !value) {
          continue;
        }
        (Array.isArray(value) ? value : [ value ]).forEach((child) => {
          if (child && child.$type && !is(child, 'bpmn:Definitions') && child.$parent === obj) {
            walk(child);
          }
        });
      }
    })(node);

    for (const c of conditions) {
      if (!isSet(c.code) || NIL.includes(c.operator)) {
        continue;
      }

      if (!recorded.has(`${c.codeSystem}|${c.code}`)) {
        reporter.report(
          nearestReportableId(c),
          `The condition reads the observation ${c.code}${c.codeDisplay ? ` (${c.codeDisplay})` : ''}, but no Observation state of this diagram records it. If no other module does before this point, Synthea raises an exception (use "is nil" / "is not nil" to ask whether it exists).`
        );
      }
    }
  }

  return { check };
};
