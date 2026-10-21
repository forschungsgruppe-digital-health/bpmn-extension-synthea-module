import SyntheaPropertiesProvider from './SyntheaPropertiesProvider.js';
import SyntheaReplaceMenuFilter from './SyntheaReplaceMenuFilter.js';
import SyntheaNoBoundaryRules from './SyntheaNoBoundaryRules.js';

/**
 * The bpmn-js editor module for the synthea extension, injected via
 * `additionalModules`. Adds properties-panel groups for the synthea:
 * extension types, and takes the gateways the converter rejects out of the
 * replace menu (SyntheaReplaceMenuFilter) and takes away the drop of an event onto a task that would attach it as a boundary event (SyntheaNoBoundaryRules). The groups cover: StateTypeConfig, ProbabilityConfig, ConditionConfig/
 * Condition (incl. `negate`), DelayConfig (incl. `delayValueHigh`),
 * GuardConfig, SubmoduleConfig, EncounterContext (incl. `encounterId`/
 * `wellness`/`reason`, see ADR-0003), EncounterReference, CounterConfig,
 * SetAttributeConfig, AssignToAttributeConfig, and ReferencedByAttributeConfig
 * (the assign/reference pair for linking a *End/Death state back to the
 * *Onset/Order/Start state it concerns).
 */
export default {
  __init__: ['syntheaPropertiesProvider', 'syntheaReplaceMenuFilter', 'syntheaNoBoundaryRules'],
  syntheaPropertiesProvider: ['type', SyntheaPropertiesProvider],
  syntheaReplaceMenuFilter: ['type', SyntheaReplaceMenuFilter],
  syntheaNoBoundaryRules: ['type', SyntheaNoBoundaryRules]
};
