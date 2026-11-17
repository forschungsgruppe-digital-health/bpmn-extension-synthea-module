const { is } = require('../lib/utils');
const { TIME_UNITS, nearestReportableId, ownerStateType, isSet } = require('../lib/values');

/**
 * SYN-38 — time-unit-valid.
 *
 * A unit of time is one of years, months, weeks, days, hours, minutes or seconds, in lower case
 * (Synthea wiki, Generic Module Framework: Basics, "Time units"; "milliseconds" is not in the list).
 * Checked where a unit of time is meant: the unit of a Delay, of a prescription's dosage period and
 * duration, of the age in an Age condition, and of the value on a Death or Procedure state (the
 * time until death, the duration of the procedure). The unit of an Observation, Symptom or
 * VitalSign value is a unit of measurement ("mg/dL", "mmHg"); any text is valid there.
 *
 * The fields are free text in the model, so a typo ("day", "Years", "mins") is valid XML and would
 * only fail when Synthea loads the module.
 */
module.exports = function() {

  function checkUnit(node, reporter, unit, where) {
    if (!isSet(unit) || TIME_UNITS.includes(unit)) {
      return;
    }

    const hint = unit.toLowerCase() === unit ? '' : ` (lower case: "${unit.toLowerCase()}")`;

    reporter.report(
      nearestReportableId(node),
      `${where} is "${unit}", which is not a unit of time${hint}. Use one of: ${TIME_UNITS.join(', ')}.`
    );
  }

  function check(node, reporter) {

    if (is(node, 'synthea:DelayConfig')) {
      checkUnit(node, reporter, node.delayUnit, 'The unit of the delay');
    }

    if (is(node, 'synthea:PrescriptionConfig')) {
      checkUnit(node, reporter, node.dosageUnit, 'The unit of the dosage period');
      checkUnit(node, reporter, node.durationUnit, 'The unit of the prescription duration');
    }

    if (is(node, 'synthea:Condition') && node.conditionType === 'Age') {
      checkUnit(node, reporter, node.unit, 'The unit of the age');
    }

    if (is(node, 'synthea:ValueConfig') && [ 'Death', 'Procedure' ].includes(ownerStateType(node))) {
      checkUnit(node, reporter, node.unit, `The unit of the ${ownerStateType(node) === 'Death' ? 'time until death' : 'procedure duration'}`);
    }
  }

  return { check };
};
