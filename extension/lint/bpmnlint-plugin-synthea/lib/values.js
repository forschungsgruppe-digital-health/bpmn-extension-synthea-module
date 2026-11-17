// Shared by the rules that check the values in the fields (SYN-38 to SYN-41).
const { getStateType } = require('./utils');

// The lists of allowed values (Synthea wiki, Generic Module Framework: Basics and Logic) are in
// extension/model/synthea.values.json, which the extension XSD is generated from as well.
const { lists } = require('../../../model/synthea.values.json');

const TIME_UNITS = lists.timeUnits;

// The id of the BPMN element a configuration element belongs to, for the report.
function nearestReportableId(node) {
  let current = node.$parent;

  while (current && !current.id) {
    current = current.$parent;
  }

  return current ? current.id : undefined;
}

// The state type of the element a configuration element belongs to (explicit setting only).
function ownerStateType(node) {
  let current = node.$parent;

  while (current && !current.extensionElements) {
    current = current.$parent;
  }

  return current ? getStateType(current) : null;
}

const isSet = (v) => v !== undefined && v !== null && v !== '';

// A number from a String or Real field, NaN when it is not one, undefined when it is not set.
function numberOf(v) {
  return isSet(v) ? Number(v) : undefined;
}

module.exports = { lists, TIME_UNITS, nearestReportableId, ownerStateType, isSet, numberOf };
