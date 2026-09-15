import SyntheaPropertiesProvider from './SyntheaPropertiesProvider.js';

/**
 * The bpmn-js editor module for the synthea extension, injected via
 * `additionalModules`. Adds properties-panel groups for all nine synthea:
 * extension types: StateTypeConfig, ProbabilityConfig, ConditionConfig/
 * Condition (incl. `negate`), DelayConfig, GuardConfig, SubmoduleConfig,
 * EncounterContext (incl. `encounterId`/`wellness`, see ADR-0003) and
 * EncounterReference.
 */
export default {
  __init__: ['syntheaPropertiesProvider'],
  syntheaPropertiesProvider: ['type', SyntheaPropertiesProvider]
};
