import SyntheaPropertiesProvider from './SyntheaPropertiesProvider.js';

/**
 * The bpmn-js editor module for the synthea extension, injected via
 * `additionalModules`. Adds properties-panel groups for all thirteen synthea:
 * extension types: StateTypeConfig, ProbabilityConfig, ConditionConfig/
 * Condition (incl. `negate`), DelayConfig (incl. `delayValueHigh`),
 * GuardConfig, SubmoduleConfig, EncounterContext (incl. `encounterId`/
 * `wellness`/`reason`, see ADR-0003), EncounterReference, CounterConfig,
 * SetAttributeConfig, AssignToAttributeConfig, and ReferencedByAttributeConfig
 * (the assign/reference pair for linking a *End/Death state back to the
 * *Onset/Order/Start state it concerns).
 */
export default {
  __init__: ['syntheaPropertiesProvider'],
  syntheaPropertiesProvider: ['type', SyntheaPropertiesProvider]
};
