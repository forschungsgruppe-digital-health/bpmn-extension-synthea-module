/**
 * Entry point of the extension: the bpmn-js module that wires the parts together (the
 * properties panel provider, the replace menu filter, the palette and context pad filter, the
 * `Initial` default of start events, the modeling rule that forbids boundary events and the lint and
 * converter messages in the panel, SyntheaDiagnostics). The moddle descriptor is a separate entry point (`bpmn-js-synthea-extension/model`).
 */
import SyntheaPropertiesProvider from './SyntheaPropertiesProvider.js';
import SyntheaReplaceMenuFilter from './SyntheaReplaceMenuFilter.js';
import SyntheaNoBoundaryRules from './SyntheaNoBoundaryRules.js';
import SyntheaPaletteFilter from './SyntheaPaletteFilter.js';
import SyntheaStartEventDefaults from './SyntheaStartEventDefaults.js';
import SyntheaDiagnostics from './SyntheaDiagnostics.js';

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
 * *Onset/Order/Start state it concerns), plus the clinical-state groups: Code,
 * Symptom, Observation, Value, Medication, Care plan activity, Imaging series and
 * the read-only list of report observations.
 */
export default {
  __init__: [
    'syntheaPropertiesProvider', 'syntheaReplaceMenuFilter', 'syntheaNoBoundaryRules',
    'syntheaPaletteFilter', 'syntheaStartEventDefaults', 'syntheaDiagnostics'
  ],
  syntheaPropertiesProvider: ['type', SyntheaPropertiesProvider],
  syntheaReplaceMenuFilter: ['type', SyntheaReplaceMenuFilter],
  syntheaNoBoundaryRules: ['type', SyntheaNoBoundaryRules],
  syntheaPaletteFilter: ['type', SyntheaPaletteFilter],
  syntheaStartEventDefaults: ['type', SyntheaStartEventDefaults],
  syntheaDiagnostics: ['type', SyntheaDiagnostics]
};

/**
 * The event fired with the problems of the selected element (`synthea.diagnostics.changed`) and the id
 * of the Problems entry in the panel, for hosts that show the problems elsewhere (SyntheaDiagnostics.js).
 */
export { DIAGNOSTICS_CHANGED_EVENT, PROBLEMS_ENTRY_ID } from './SyntheaDiagnostics.js';
