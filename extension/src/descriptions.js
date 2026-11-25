/**
 * Short explanations shown under a field in the properties panel, keyed by the label of the field
 * (the text in SyntheaPropertiesProvider.js). A label without an entry here shows no description.
 * A test (extension/test/panel-descriptions.test.mjs) fails when a key matches no label.
 */

/**
 * The explanation of each field, by the label of the field.
 *
 * @type {Record<string, string>}
 */
export const DESCRIPTIONS = {
  'State Type': 'The Synthea state this element becomes. Leave it empty and the converter infers it from the BPMN element.',
  'Code system': 'The vocabulary of the code, for example SNOMED-CT, LOINC or RxNorm.',
  'Code': 'The clinical code of this state. Synthea needs the code system, the code and the display text together.',
  'Display text': 'The readable name of the code, as it appears in the patient record.',
  'Probability as': 'A fixed number, or the value of a patient attribute that is read when the simulation runs.',
  'Probability (0.0 - 1.0)': 'The numbers on all flows that leave the same gateway must add up to 1.0. One flow without a probability gets the remainder.',
  'Attribute that holds the probability': 'Name of a patient attribute with a number between 0 and 1. Put this branch before the catch-all branch: the last branch gets what is left.',
  'Delay shape': 'EXACT waits for one fixed time. RANGE waits for a random time between two values (every value equally likely).',
  'Delay unit': 'years, months, weeks, days, hours, minutes or seconds.',
  'Encounter context': 'Tick this on every state that happens during the same visit. Without it, the other encounter fields do nothing.',
  'Encounter ID (groups states into one encounter)': 'Any text. Use the same one on every state of one visit, and a different one for another visit.',
  'Wellness encounter': 'A routine check-up. Synthea then waits for the next scheduled check-up, which can be years away. Leave it off for an emergency or a diagnosis visit.',
  'Submodule reference': 'The name of the BPMN file of the called module, with "-" written as "_" and without ".bpmn" (lung-cancer-treatment-submodule.bpmn becomes lung_cancer_treatment_submodule). The converter checks that the file exists.',
  'Condition type': 'What the branch tests. The fields below change with the type.',
  'Negate (Not)': 'Turns the condition around: what was true becomes false.',
  'Operator (e.g. <=, ==, >)': 'One of ==, !=, <, >, <= and >=. Tests on an attribute or an observation also accept "is nil" and "is not nil".',
  'Attribute name': 'The name of a patient attribute. Attribute names are shared by all modules, so choose a name no other module uses, in lower_snake_case.',
  'Referenced attribute (entity to check)': 'The patient attribute that holds the state to look at, set earlier by a state with "Assign to attribute".'
};

/**
 * The description of a field.
 *
 * @param {string} label the label of the field, as in the panel
 * @returns {string|undefined} the description, undefined when the field has none
 */
export function describe(label) {
  return DESCRIPTIONS[label];
}
