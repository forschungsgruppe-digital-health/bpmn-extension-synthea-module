const { is } = require('../lib/utils');
const { lists, nearestReportableId, isSet } = require('../lib/values');

/**
 * SYN-39 — condition-values-valid.
 *
 * The values in a condition (Synthea wiki, Generic Module Framework: Logic):
 *  - operator: Age, Date, Symptom and Vital Sign take ==, !=, <, >, <= or >=; Attribute and
 *    Observation also take "is nil" and "is not nil".
 *  - Gender is M or F; Race is White, Native, Hispanic, Black, Asian or Other; the socioeconomic
 *    status (category) is High, Middle or Low.
 *  - At Least and At Most: the number is between 1 and the number of sub-conditions.
 *  - Date: exactly one of year and month (the full date object is not modelled).
 *  - Age: the quantity is not negative.
 *
 * Operator and the names are free text in the model, so "=" or "male" are valid XML and would only
 * fail when Synthea loads the module.
 */
const COMPARISON = lists.comparisonOperators;
const WITH_NIL = lists.allOperators;

const OPERATORS = {
  Age: COMPARISON,
  Date: COMPARISON,
  Symptom: COMPARISON,
  'Vital Sign': COMPARISON,
  Attribute: WITH_NIL,
  Observation: WITH_NIL
};

const ENUMS = {
  Gender: { field: 'gender', label: 'gender', values: lists.gender },
  Race: { field: 'race', label: 'race', values: lists.race },
  'Socioeconomic Status': { field: 'category', label: 'socioeconomic status', values: lists.socioeconomicStatus }
};

module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:Condition') || !node.conditionType) {
      return;
    }

    const type = node.conditionType;
    const id = nearestReportableId(node);
    const report = (message) => reporter.report(id, `${type} condition: ${message}`);

    const operators = OPERATORS[type];

    if (operators && isSet(node.operator) && !operators.includes(node.operator)) {
      report(`operator "${node.operator}" is not valid. Use one of: ${operators.join(', ')}.`);
    }

    const en = ENUMS[type];

    if (en && isSet(node[en.field]) && !en.values.includes(node[en.field])) {
      report(`${en.label} "${node[en.field]}" is not valid. Use one of: ${en.values.join(', ')}.`);
    }

    if (type === 'At Least' || type === 'At Most') {
      const bound = type === 'At Least' ? node.minimum : node.maximum;
      const count = (node.conditions || []).length;

      if (isSet(bound) && (bound < 1 || bound > count)) {
        report(`${type === 'At Least' ? 'minimum' : 'maximum'} is ${bound}, but it has to be between 1 and the number of sub-conditions (${count}).`);
      }
    }

    if (type === 'Date' && isSet(node.year) && isSet(node.month)) {
      report('set either year or month, not both.');
    }

    if (type === 'Age' && isSet(node.quantity) && node.quantity < 0) {
      report(`the quantity ${node.quantity} is negative.`);
    }
  }

  return { check };
};
