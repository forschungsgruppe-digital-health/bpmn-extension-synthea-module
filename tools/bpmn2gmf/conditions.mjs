// synthea:Condition -> GMF condition object.

const NUMERIC = /^-?\d+(\.\d+)?$/;

// Our schema stores every value as a string; GMF distinguishes numbers,
// booleans and strings (decision 6: numeric -> number, true/false -> boolean).
export function typedValue(raw) {
  if (raw === undefined || raw === null) return undefined;
  if (NUMERIC.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

// Numeric attributes (`Real` in the schema) are read as numbers by moddle; this
// stays tolerant of strings so hand-built or older models still convert.
export const num = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));

const NIL_OPERATORS = new Set(['is nil', 'is not nil']);

const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

function numeric(raw, field, report) {
  if (raw === undefined) return undefined;
  const n = typedValue(raw);
  if (typeof n !== 'number') report(`"${field}" must be a number, got "${raw}".`);
  return n;
}

// report(message) records an error with the caller's context.
export function conditionToGmf(c, report) {
  const type = c.conditionType;
  if (!type) {
    report('Condition has no conditionType.');
    return null;
  }
  const t = { condition_type: type };
  const operatorAndValue = (numericValue) => ({
    operator: c.operator,
    value: NIL_OPERATORS.has(c.operator)
      ? undefined
      : numericValue ? numeric(c.value, 'value', report) : typedValue(c.value)
  });
  const sub = () =>
    (c.conditions ?? []).map((s) => conditionToGmf(s, report)).filter(Boolean);

  let out;
  switch (type) {
    case 'Attribute':
      out = compact({ ...t, attribute: c.attribute, ...operatorAndValue(false) });
      break;
    case 'Gender':
      out = { ...t, gender: c.gender };
      break;
    case 'Race':
      out = { ...t, race: c.race };
      break;
    case 'Socioeconomic Status':
      out = { ...t, category: c.category };
      break;
    case 'Age':
      out = { ...t, operator: c.operator, quantity: num(c.quantity), unit: c.unit };
      break;
    case 'Date':
      out = compact({ ...t, operator: c.operator, year: c.year, month: c.month });
      break;
    case 'Symptom':
      out = compact({ ...t, symptom: c.symptom, ...operatorAndValue(true) });
      break;
    case 'Observation':
      out = compact({ ...t, referenced_by_attribute: c.referencedAttribute, ...operatorAndValue(true) });
      break;
    case 'Vital Sign':
      out = compact({ ...t, vital_sign: c.vitalSign, ...operatorAndValue(true) });
      break;
    case 'Active Condition':
    case 'Active Medication':
    case 'Active Allergy':
    case 'Active CarePlan':
      out = { ...t, referenced_by_attribute: c.referencedAttribute };
      break;
    case 'PriorState':
      out = compact({
        ...t,
        name: c.priorStateName,
        since: c.since,
        within: c.quantity !== undefined ? { quantity: num(c.quantity), unit: c.unit } : undefined
      });
      break;
    case 'True':
    case 'False':
      out = t;
      break;
    case 'And':
    case 'Or':
      out = { ...t, conditions: sub() };
      break;
    case 'At Least':
      out = { ...t, minimum: c.minimum, conditions: sub() };
      break;
    case 'At Most':
      out = { ...t, maximum: c.maximum, conditions: sub() };
      break;
    default:
      report(`Unknown conditionType "${type}".`);
      return null;
  }

  // negate is a bridging construct: GMF only knows a separate Not wrapper.
  return c.negate ? { condition_type: 'Not', condition: out } : out;
}
