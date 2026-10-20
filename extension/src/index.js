import SyntheaPropertiesProvider from './SyntheaPropertiesProvider.js';
import SyntheaReplaceMenuFilter from './SyntheaReplaceMenuFilter.js';

/**
 * The bpmn-js editor module for the synthea extension, injected via
 * `additionalModules`. Adds properties-panel groups for the synthea:
 * extension types, and takes the gateways the converter rejects out of the
 * replace menu (SyntheaReplaceMenuFilter). The groups cover: StateTypeConfig, ProbabilityConfig, ConditionConfig/
 * Condition (incl. `negate`), DelayConfig (incl. `delayValueHigh`),
 * GuardConfig, SubmoduleConfig, EncounterContext (incl. `encounterId`/
 * `wellness`/`reason`, see ADR-0003), EncounterReference, CounterConfig,
 * SetAttributeConfig, AssignToAttributeConfig, and ReferencedByAttributeConfig
 * (the assign/reference pair for linking a *End/Death state back to the
 * *Onset/Order/Start state it concerns).
 */
export default {
  __init__: ['syntheaPropertiesProvider', 'syntheaReplaceMenuFilter'],
  syntheaPropertiesProvider: ['type', SyntheaPropertiesProvider],
  syntheaReplaceMenuFilter: ['type', SyntheaReplaceMenuFilter]
};
