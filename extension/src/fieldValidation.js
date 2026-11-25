/**
 * Checks for the fields of the properties panel: a wrong entry is marked in red under the field as
 * it is typed, not only later in the converter and lint messages. Each check returns the message
 * to show, or null when the value is fine (an empty field is fine: what is required is the
 * converter's job, `extension/src/converter/required-fields.mjs`).
 *
 * The shapes of codes and attribute names are the ones of the lint rules (`patterns` in
 * extension/model/synthea.values.json), so the panel and the lint never disagree. Only an entry that
 * is not a number in a number field is not stored; the other messages warn, and the value stays.
 */
import values from '../model/synthea.values.json';

const { patterns } = values;
const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const INTEGER = /^[+-]?\d+$/;

const isEmpty = (value) => value === undefined || value === null || String(value).trim() === '';

/**
 * Is the text a number (for a field that is stored as a number)?
 *
 * @param {string} value the text in the field
 * @param {{ integer?: boolean }} [options] `integer`: a whole number is needed
 * @returns {string|null} the message, or null when the value is fine or empty
 */
export function numberError(value, { integer = false } = {}) {
  if (isEmpty(value)) return null;
  const text = String(value).trim();
  if (integer) return INTEGER.test(text) ? null : 'Enter a whole number, e.g. 3.';
  return NUMBER.test(text) ? null : 'Enter a number, e.g. 0.25 (with a dot, no unit).';
}

/**
 * Is the number inside a range?
 *
 * @param {string} value the text in the field
 * @param {{ min?: number, max?: number, above?: number, integer?: boolean }} [bounds] `min`/`max` are allowed, `above` is the exclusive lower bound
 * @returns {string|null} the message, or null when the value is fine or empty
 */
export function rangeError(value, { min, max, above, integer = false } = {}) {
  const notNumber = numberError(value, { integer });
  if (notNumber || isEmpty(value)) return notNumber;
  const n = Number(value);
  if (min !== undefined && max !== undefined && (n < min || n > max)) return `Has to be between ${min} and ${max}.`;
  if (min !== undefined && n < min) return `Cannot be below ${min}.`;
  if (max !== undefined && n > max) return `Cannot be above ${max}.`;
  if (above !== undefined && n <= above) return `Has to be above ${above}.`;
  return null;
}

/**
 * Does the code have the shape of its code system (not a lookup, only a typo check)?
 *
 * @param {string} value the code
 * @param {string} [system] the URI of the code system; without one nothing is checked
 * @returns {string|null} the message, or null when the value is fine, empty, or the system has no known shape
 */
export function codeError(value, system) {
  const known = patterns.codeSystems[system];
  if (isEmpty(value) || !known) return null;
  const text = String(value);
  if (!new RegExp(known.pattern).test(text.trim()) || /\s/.test(text)) {
    return `Does not look like a ${known.name} code (${known.shape}).`;
  }
  return null;
}

/**
 * Does the text have the shape the Synthea wiki gives for a pattern (a DICOM modality, a SOP class)?
 *
 * @param {string} value the text in the field
 * @param {'dicomModality'|'sopClass'} name the pattern in `patterns` of synthea.values.json
 * @returns {string|null} the message, or null when the value is fine or empty
 */
export function patternError(value, name) {
  if (isEmpty(value)) return null;
  const { pattern, shape } = patterns[name];
  return new RegExp(pattern).test(String(value)) ? null : `Does not look right (${shape}).`;
}

/**
 * Is the attribute name lower_snake_case (the names are shared by the whole simulation)?
 *
 * @param {string} value the attribute name
 * @returns {string|null} the message, or null when the value is fine or empty
 */
export function attributeNameError(value) {
  const { pattern, shape, builtIn } = patterns.attributeName;
  if (isEmpty(value) || builtIn.includes(value) || new RegExp(pattern).test(value)) return null;
  return `Attribute names are ${shape}.`;
}
