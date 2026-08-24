import SyntheaPropertiesProvider from './SyntheaPropertiesProvider.js';

/**
 * The bpmn-js editor module for the synthea extension, injected via
 * `additionalModules`. Adds properties-panel groups for exactly three
 * synthea: extension types: StateTypeConfig, ProbabilityConfig, and
 * ConditionConfig/Condition (incl. `negate`). See README.md for what's
 * deliberately left out (Guard, Delay, Encounter context, Pair reference,
 * Lookup table, Composite condition — full extension only).
 */
export default {
  __init__: ['syntheaPropertiesProvider'],
  syntheaPropertiesProvider: ['type', SyntheaPropertiesProvider]
};
