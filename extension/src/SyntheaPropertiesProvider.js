import { is, getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';
import {
  CollapsibleEntry,
  TextFieldEntry,
  TextAreaEntry,
  isTextFieldEntryEdited,
  CheckboxEntry,
  SelectEntry
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';

const LOW_PRIORITY = 500;


const PROBABILITY_TYPE = 'synthea:ProbabilityConfig';
const CONDITION_CONFIG_TYPE = 'synthea:ConditionConfig';
const STATE_TYPE = 'synthea:StateTypeConfig';
const DELAY_TYPE = 'synthea:DelayConfig';
const GUARD_TYPE = 'synthea:GuardConfig';
const SUBMODULE_TYPE = 'synthea:SubmoduleConfig';
const ENCOUNTER_CONTEXT_TYPE = 'synthea:EncounterContext';
const ENCOUNTER_REFERENCE_TYPE = 'synthea:EncounterReference';
const COUNTER_TYPE = 'synthea:CounterConfig';
const SYMPTOM_TYPE = 'synthea:SymptomConfig';
const OBSERVATION_TYPE = 'synthea:ObservationConfig';
const VALUE_TYPE = 'synthea:ValueConfig';
const SERIES_TYPE = 'synthea:ImagingStudySeries';
const MEDICATION_TYPE = 'synthea:MedicationConfig';
const ACTIVITY_TYPE = 'synthea:CarePlanActivity';
const SET_ATTRIBUTE_TYPE = 'synthea:SetAttributeConfig';
const ASSIGN_TO_ATTRIBUTE_TYPE = 'synthea:AssignToAttributeConfig';
const REFERENCED_BY_ATTRIBUTE_TYPE = 'synthea:ReferencedByAttributeConfig';

// Which state types a group applies to. The two attribute lists mirror the lint rules
// assign-to-attribute-requires-valid-state and referenced-by-attribute-requires-valid-state.
const COUNTER_STATE_TYPES = ['Counter'];
const SET_ATTRIBUTE_STATE_TYPES = ['SetAttribute'];
const ASSIGN_STATE_TYPES = ['ConditionOnset', 'AllergyOnset', 'MedicationOrder', 'CarePlanStart', 'Device'];
const REFERENCED_STATE_TYPES = ['ConditionEnd', 'AllergyEnd', 'MedicationEnd', 'CarePlanEnd', 'DeviceEnd', 'Death'];

const DELAY_SHAPE_VALUES = ['EXACT', 'RANGE'];
const COUNTER_ACTION_VALUES = ['increment', 'decrement'];
// HL7 observation categories (the list the Synthea wiki points to)
// Distributions of a SetAttribute and the parameters each needs (States wiki, Delay "distribution")
const DISTRIBUTION_KINDS = ['EXACT', 'UNIFORM', 'GAUSSIAN', 'EXPONENTIAL'];
const DISTRIBUTION_PARAMETERS_BY_KIND = {
  EXACT: ['value'],
  UNIFORM: ['low', 'high'],
  GAUSSIAN: ['mean', 'standardDeviation', 'min', 'max'],
  EXPONENTIAL: ['mean']
};

// Alternatives that exclude each other ("Value as", "Probability as"): the fields that belong
// to each choice. The choice is read from the stored kind, or from the fields that are set.
const SET_ATTRIBUTE_KIND_FIELDS = {
  VALUE: ['value'],
  ATTRIBUTE: ['valueAttribute'],
  DISTRIBUTION: ['distribution', 'distributionRound', 'distributionValue', 'distributionMean',
    'distributionStandardDeviation', 'distributionMin', 'distributionMax', 'distributionLow', 'distributionHigh']
};
const PROBABILITY_KIND_FIELDS = {
  FIXED: ['probability'],
  ATTRIBUTE: ['probabilityAttribute', 'probabilityDefault']
};

const OBSERVATION_CATEGORY_VALUES = ['vital-signs', 'laboratory', 'procedure', 'imaging', 'survey', 'exam', 'therapy', 'social-history'];

const ENCOUNTER_CLASS_VALUES = ['wellness', 'ambulatory', 'emergency', 'urgentcare', 'inpatient', 'outpatient'];

const CONDITION_TYPE_VALUES = [
  'Attribute', 'Gender', 'Race', 'Socioeconomic Status', 'Age', 'Date', 'Symptom',
  'Observation', 'Vital Sign', 'Active Condition', 'Active Medication', 'Active Allergy',
  'Active CarePlan', 'PriorState', 'True', 'False', 'And', 'Or', 'At Least', 'At Most'
];

// Combinator types hold their sub-conditions in `conditions` instead of flat
// fields — see MAX_NESTED_CONDITIONS below for the panel's (schema-unlimited,
// UI-limited) nesting support.
const CONDITION_COMBINATOR_TYPES = ['And', 'Or', 'At Least', 'At Most'];

// Observation and the Active-* types match their entity either by the name of an
// attribute (`referencedAttribute`) or by a code (`codeSystem` + `code` +
// `codeDisplay`, all three required by Synthea whenever a code is used) — one
// of the two, not both. Code systems the converter knows are listed in
// CODE_SYSTEM_OPTIONS below.
//
// Which Condition fields are meaningful for each conditionType — drives which
// entries the Condition/Guard groups actually show. operator/value are the
// Attribute-only pair; other types reuse operator (Age/Date/Symptom/
// Observation/Vital Sign) or value (Symptom/Observation/Vital Sign) alongside
// their own field, per the Synthea wiki's per-type field list. And/Or take no
// flat field at all (just `conditions`); At Least/At Most add minimum/maximum
// alongside `conditions`.
const CONDITION_FIELDS_BY_TYPE = {
  'Attribute': ['attribute', 'operator', 'value'],
  'Gender': ['gender'],
  'Race': ['race'],
  'Socioeconomic Status': ['category'],
  'Age': ['quantity', 'unit', 'operator'],
  'Date': ['year', 'month', 'operator'],
  'Symptom': ['symptom', 'operator', 'value'],
  'Observation': ['referencedAttribute', 'codeSystem', 'code', 'codeDisplay', 'operator', 'value'],
  'Vital Sign': ['vitalSign', 'operator', 'value'],
  'Active Condition': ['referencedAttribute', 'codeSystem', 'code', 'codeDisplay'],
  'Active Medication': ['referencedAttribute', 'codeSystem', 'code', 'codeDisplay'],
  'Active Allergy': ['referencedAttribute', 'codeSystem', 'code', 'codeDisplay'],
  'Active CarePlan': ['referencedAttribute', 'codeSystem', 'code', 'codeDisplay'],
  // Synthea's `within` is a {quantity, unit} object, not free text — reuses
  // the same quantity/unit fields Age uses (different meaning, same shape;
  // tools/bpmn2gmf nests them under "within" for PriorState, flat for Age).
  'PriorState': ['priorStateName', 'since', 'quantity', 'unit'],
  'True': [],
  'False': [],
  'And': [],
  'Or': [],
  'At Least': ['minimum'],
  'At Most': ['maximum']
};

// The moddle schema allows conditions to nest arbitrarily deep (`conditions`
// is self-referencing), but the properties panel only offers editing for one
// level of sub-conditions, up to this many — a documented simplification
// (see docs/implicit-rules.md). Deeper nesting still round-trips correctly
// if hand-authored in the XML; the panel just won't build it for you.
const MAX_NESTED_CONDITIONS = 3;

function getRelevantConditionFields(conditionType) {
  return CONDITION_FIELDS_BY_TYPE[conditionType] || CONDITION_FIELDS_BY_TYPE['Attribute'];
}

function isCombinatorConditionType(conditionType) {
  return CONDITION_COMBINATOR_TYPES.includes(conditionType);
}

// Systems the code of an Observation/Active-* condition can come from; the value
// is the system URI; tools/bpmn2gmf maps it to Synthea's name.
const CODE_SYSTEM_OPTIONS = [
  { value: 'http://loinc.org', label: 'LOINC' },
  { value: 'http://snomed.info/sct', label: 'SNOMED CT' },
  { value: 'http://www.nlm.nih.gov/research/umls/rxnorm', label: 'RxNorm' }
];

// The state types the converter accepts per kind of element (tools/bpmn2gmf/resolve.mjs,
// ALLOWED_BY_KIND). Tasks and other events accept every state type.
const TASK_EXCLUDED_STATE_TYPES = ['Initial', 'Terminal', 'CallSubmodule', 'Guard', 'Delay'];

function stateTypeValuesFor(element) {
  if (is(element, 'bpmn:StartEvent')) return ['Initial'];
  if (is(element, 'bpmn:EndEvent')) return ['Terminal', 'Death'];
  if (is(element, 'bpmn:ExclusiveGateway')) return ['Simple', 'Guard'];
  if (is(element, 'bpmn:CallActivity')) return ['CallSubmodule'];
  if (is(element, 'bpmn:SubProcess')) return ['CallSubmodule'];
  // Initial, Terminal, CallSubmodule, Guard and Delay each have an element of their own (start event,
  // end event, call activity, gateway, timer event); a task is none of them.
  if (is(element, 'bpmn:Task')) return STATE_TYPE_VALUES.filter((v) => !TASK_EXCLUDED_STATE_TYPES.includes(v));
  return STATE_TYPE_VALUES;
}

const STATE_TYPE_VALUES = [
  'Initial', 'Terminal', 'Simple', 'Guard', 'Delay', 'SetAttribute', 'Counter',
  'CallSubmodule', 'ConditionOnset', 'ConditionEnd',
  'MedicationOrder', 'MedicationEnd', 'CarePlanStart',
  'CarePlanEnd', 'Procedure', 'ImagingStudy', 'Device', 'DeviceEnd',
  'Observation', 'MultiObservation', 'DiagnosticReport', 'Symptom',
  'Death'
];


export default function SyntheaMiniPropertiesProvider(propertiesPanel, injector) {
  this.getGroups = function (element) {
    return function (groups) {
      const firstOwn = groups.length;

      if (is(element, 'bpmn:StartEvent')) {
        groups.push(...createStateTypeGroups(element));
      }

      if (is(element, 'bpmn:EndEvent')) {
        groups.push(...createStateTypeGroups(element));
        groups.push(createEncounterContextGroup(element));
        if (appliesTo(element, REFERENCED_STATE_TYPES, REFERENCED_BY_ATTRIBUTE_TYPE)) {
          groups.push(createReferencedByAttributeGroup(element));
        }
        groups.push(...createStateDetailGroups(element));
      }

      if (is(element, 'bpmn:Task')) {
        groups.push(...createStateTypeGroups(element));
        groups.push(createEncounterContextGroup(element));
        if (appliesTo(element, COUNTER_STATE_TYPES, COUNTER_TYPE)) {
          groups.push(createCounterGroup(element));
        }
        if (appliesTo(element, SET_ATTRIBUTE_STATE_TYPES, SET_ATTRIBUTE_TYPE)) {
          groups.push(createSetAttributeGroup(element));
        }
        if (appliesTo(element, ASSIGN_STATE_TYPES, ASSIGN_TO_ATTRIBUTE_TYPE)) {
          groups.push(createAssignToAttributeGroup(element));
        }
        if (appliesTo(element, REFERENCED_STATE_TYPES, REFERENCED_BY_ATTRIBUTE_TYPE)) {
          groups.push(createReferencedByAttributeGroup(element));
        }
        groups.push(...createStateDetailGroups(element));

        if (isConditionOrAllergyOnset(element)) {
          groups.push(createEncounterReferenceGroup(element));
        }
      }

      if (is(element, 'bpmn:SubProcess') || is(element, 'bpmn:CallActivity')) {
        groups.push(...createStateTypeGroups(element));
        groups.push(createEncounterContextGroup(element));
        // A sub-process with content becomes a module of its own, which it calls; only an empty one
        // names a module of a file of its own.
        const hasContent = is(element, 'bpmn:SubProcess') && (getBusinessObject(element).get('flowElements') || []).length > 0;
        if (is(element, 'bpmn:SubProcess') && stateTypeOf(element) === 'CallSubmodule' && !hasContent) {
          groups.push(createSubmoduleGroup(element));
        }
      }

      if (is(element, 'bpmn:IntermediateCatchEvent') || is(element, 'bpmn:IntermediateThrowEvent')) {
        groups.push(...createStateTypeGroups(element));
        groups.push(createDelayGroup(element));
        groups.push(createEncounterContextGroup(element));
        if (appliesTo(element, ASSIGN_STATE_TYPES, ASSIGN_TO_ATTRIBUTE_TYPE)) {
          groups.push(createAssignToAttributeGroup(element));
        }
        if (appliesTo(element, REFERENCED_STATE_TYPES, REFERENCED_BY_ATTRIBUTE_TYPE)) {
          groups.push(createReferencedByAttributeGroup(element));
        }
        groups.push(...createStateDetailGroups(element));

        if (isConditionOrAllergyOnset(element)) {
          groups.push(createEncounterReferenceGroup(element));
        }
      }

      if (is(element, 'bpmn:SequenceFlow')) {
        groups.push(createProbabilityGroup(element));
        groups.push(createConditionGroup(element));
        groups.push(...createNestedConditionGroups(element, getFlowCondition, ensureFlowCondition, 'synthea-condition'));
      }

      if (is(element, 'bpmn:ExclusiveGateway')) {
        groups.push(...createStateTypeGroups(element));
        groups.push(createGuardGroup(element));
        groups.push(...createNestedConditionGroups(element, getGuardCondition, ensureGuardCondition, 'synthea-guard-condition'));
      }

      if (is(element, 'bpmn:CallActivity')) {
        groups.push(createSubmoduleGroup(element));
      }

      // Everything above is ours: fold it into one "Synthea" group whose sections open and
      // close on their own, so the panel shows a single entry instead of a long list.
      const own = groups.splice(firstOwn);
      if (own.length) {
        groups.push(createSyntheaGroup(own));
      }

      return groups;
    };
  };

  propertiesPanel.registerProvider(LOW_PRIORITY, this);
}

SyntheaMiniPropertiesProvider.$inject = ['propertiesPanel', 'injector'];

// --- groups ------------------------------------------------------------

// The panel marks the group as edited when a section has a value: a text, a ticked box or a
// chosen option. It hands over the first input of the section, from which the whole section is read.
function isSectionEdited(input) {
  const section = input && input.closest('.bio-properties-panel-collapsible-entry');

  if (!section) {
    return false;
  }

  return [...section.querySelectorAll('input, select, textarea')].some(
    (field) => (field.type === 'checkbox' ? field.checked : !!field.value)
  );
}

// One group "Synthea" holding every synthea: group as a collapsible section of its own.
// The first section starts open.
function createSyntheaGroup(sections) {
  return {
    id: 'synthea',
    label: 'Synthea',
    shouldOpen: true,
    entries: sections.map((section, index) => ({
      id: `synthea-section-${section.id}`,
      component: CollapsibleEntry,
      label: section.label,
      open: index === 0,
      entries: section.entries,
      isEdited: isSectionEdited
    }))
  };
}

// The state types that carry a clinical code (the same list as tools/bpmn2gmf/codes.mjs).
const CODED_STATE_TYPES = [
  'ConditionOnset', 'ConditionEnd', 'AllergyOnset', 'AllergyEnd', 'MedicationOrder', 'MedicationEnd',
  'CarePlanStart', 'CarePlanEnd', 'Procedure', 'ImagingStudy', 'Device', 'DeviceEnd',
  'Observation', 'MultiObservation', 'DiagnosticReport', 'Death'
];

// State Type, followed by Code for the state types that carry one. A code that is already
// set is shown whatever the state type.
function createStateTypeGroups(element) {
  const groups = [createStateTypeGroup(element)];
  const config = getExtension(element, STATE_TYPE);

  // An end state or Death names the ended entity by its code or by an attribute, not both:
  // with "Attribute" chosen the Code section is hidden (unless a code is still there).
  const namesByAttribute = REFERENCED_STATE_TYPES.includes(stateTypeOf(element)) && !!getExtension(element, REFERENCED_BY_ATTRIBUTE_TYPE);
  const hasCode = !!(config && config.get('code'));
  if ((CODED_STATE_TYPES.includes(stateTypeOf(element)) && !namesByAttribute) || hasCode) {
    groups.push(createCodeGroup(element));
  }

  return groups;
}

function createCodeGroup(element) {
  return {
    id: 'synthea-code',
    label: 'Code',
    entries: [
      { id: 'synthea-code-system', element, component: CodeSystemEntry },
      { id: 'synthea-code-value', element, component: CodeValueEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-code-display', element, component: CodeDisplayEntry, isEdited: isTextFieldEntryEdited }
    ]
  };
}

function createStateTypeGroup(element) {
  return {
    id: 'synthea-state-type',
    label: 'State Type',
    entries: [
      { id: 'synthea-state-type-value', element, component: StateTypeEntry }
    ]
  };
}

// "Probability as" decides which fields follow; the fields of the other choice are cleared.
function createProbabilityGroup(element) {
  const kind = kindOf(getExtension(element, PROBABILITY_TYPE), 'probabilityKind', PROBABILITY_KIND_FIELDS, 'FIXED');
  const entries = [{ id: 'synthea-probability-kind', element, component: ProbabilityKindEntry }];
  if (kind === 'FIXED') {
    entries.push({ id: 'synthea-probability-value', element, component: ProbabilityEntry, isEdited: isTextFieldEntryEdited });
  }
  if (kind === 'ATTRIBUTE') {
    entries.push(
      { id: 'synthea-probability-attribute', element, component: ProbabilityAttributeEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-probability-default', element, component: ProbabilityDefaultEntry, isEdited: isTextFieldEntryEdited }
    );
  }
  return {
    id: 'synthea-probability',
    label: 'Probability',
    entries
  };
}

function createConditionGroup(element) {
  const conditionType = getFlowCondition(element)?.get('conditionType');
  const fields = getRelevantConditionFields(conditionType);

  const entries = [
    { id: 'synthea-condition-type', element, component: FlowConditionTypeEntry }
  ];

  fields.forEach((field) => {
    entries.push({
      id: `synthea-condition-${field}`,
      element,
      component: FLOW_CONDITION_FIELD_ENTRIES[field],
      isEdited: isTextFieldEntryEdited
    });
  });

  entries.push({ id: 'synthea-condition-negate', element, component: FlowConditionNegateEntry });

  return {
    id: 'synthea-condition',
    label: 'Condition',
    entries
  };
}

function createDelayGroup(element) {
  const config = getExtension(element, DELAY_TYPE);
  const delayShape = config ? config.get('delayShape') : undefined;

  const entries = [
    { id: 'synthea-delay-shape', element, component: DelayShapeEntry },
    { id: 'synthea-delay-value', element, component: DelayValueEntry, isEdited: isTextFieldEntryEdited }
  ];

  // delayValueHigh only means anything for RANGE (the low/high pair) —
  // for EXACT there's only ever one number, so hide it instead of showing
  // a field that would silently do nothing.
  if (delayShape === 'RANGE') {
    entries.push({ id: 'synthea-delay-value-high', element, component: DelayValueHighEntry, isEdited: isTextFieldEntryEdited });
  }

  entries.push({ id: 'synthea-delay-unit', element, component: DelayUnitEntry, isEdited: isTextFieldEntryEdited });

  return {
    id: 'synthea-delay',
    label: 'Delay',
    entries
  };
}

function createGuardGroup(element) {
  const conditionType = getGuardCondition(element)?.get('conditionType');
  const fields = getRelevantConditionFields(conditionType);

  const entries = [
    { id: 'synthea-guard-condition-type', element, component: GuardConditionTypeEntry }
  ];

  fields.forEach((field) => {
    entries.push({
      id: `synthea-guard-condition-${field}`,
      element,
      component: GUARD_CONDITION_FIELD_ENTRIES[field],
      isEdited: isTextFieldEntryEdited
    });
  });

  entries.push({ id: 'synthea-guard-condition-negate', element, component: GuardConditionNegateEntry });

  return {
    id: 'synthea-guard',
    label: 'Guard',
    entries
  };
}

function createSubmoduleGroup(element) {
  return {
    id: 'synthea-submodule',
    label: 'Submodule',
    entries: [
      { id: 'synthea-submodule-ref', element, component: SubmoduleEntry, isEdited: isTextFieldEntryEdited }
    ]
  };
}

function createEncounterContextGroup(element) {
  const config = getExtension(element, ENCOUNTER_CONTEXT_TYPE);
  const wellness = config ? !!config.get('wellness') : false;

  const entries = [
    { id: 'synthea-encounter-context-value', element, component: EncounterContextEntry },
    { id: 'synthea-encounter-context-id', element, component: EncounterIdEntry, isEdited: isTextFieldEntryEdited },
    { id: 'synthea-encounter-context-wellness', element, component: EncounterWellnessEntry }
  ];

  // encounterClass is only meaningful (and, per Synthea, required) for
  // non-wellness encounters — hide it once wellness is checked instead of
  // showing a field with nothing to do.
  if (!wellness) {
    entries.push({ id: 'synthea-encounter-context-class', element, component: EncounterClassEntry });
    // Synthea requires a code for every non-wellness encounter; all three parts
    // go together and must be the same on every member of the group.
    entries.push({ id: 'synthea-encounter-context-code-system', element, component: EncounterCodeSystemEntry });
    entries.push({ id: 'synthea-encounter-context-code', element, component: EncounterCodeEntry, isEdited: isTextFieldEntryEdited });
    entries.push({ id: 'synthea-encounter-context-code-display', element, component: EncounterCodeDisplayEntry, isEdited: isTextFieldEntryEdited });
  }

  entries.push({ id: 'synthea-encounter-context-reason', element, component: EncounterReasonEntry, isEdited: isTextFieldEntryEdited });

  return {
    id: 'synthea-encounter-context',
    label: 'Encounter Context',
    entries
  };
}

function createEncounterReferenceGroup(element) {
  return {
    id: 'synthea-encounter-reference',
    label: 'Encounter Reference',
    entries: [
      { id: 'synthea-encounter-reference-value', element, component: EncounterReferenceEntry, isEdited: isTextFieldEntryEdited }
    ]
  };
}

function createCounterGroup(element) {
  return {
    id: 'synthea-counter',
    label: 'Counter',
    entries: [
      { id: 'synthea-counter-attribute', element, component: CounterAttributeEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-counter-action', element, component: CounterActionEntry },
      { id: 'synthea-counter-amount', element, component: CounterAmountEntry, isEdited: isTextFieldEntryEdited }
    ]
  };
}

// "Value as" decides which fields follow (a fixed value, a copy of another attribute or a
// distribution); the fields of the other choices are cleared when the choice changes.
function createSetAttributeGroup(element) {
  const config = getExtension(element, SET_ATTRIBUTE_TYPE);
  const kind = kindOf(config, 'valueKind', SET_ATTRIBUTE_KIND_FIELDS, 'VALUE');
  const entries = [
    { id: 'synthea-set-attribute-value', element, component: SetAttributeEntry, isEdited: isTextFieldEntryEdited },
    { id: 'synthea-set-attribute-kind', element, component: SetAttributeKindEntry }
  ];
  if (kind === 'VALUE') {
    entries.push({ id: 'synthea-set-attribute-assigned-value', element, component: SetAttributeValueEntry, isEdited: isTextFieldEntryEdited });
  }
  if (kind === 'ATTRIBUTE') {
    entries.push({ id: 'synthea-set-attribute-value-attribute', element, component: SetAttributeValueAttributeEntry, isEdited: isTextFieldEntryEdited });
  }
  if (kind === 'DISTRIBUTION') {
    entries.push(
      { id: 'synthea-distribution-kind', element, component: DistributionKindEntry },
      { id: 'synthea-distribution-round', element, component: DistributionRoundEntry }
    );
    for (const parameter of DISTRIBUTION_PARAMETERS_BY_KIND[config.get('distribution')] ?? []) {
      entries.push({ id: `synthea-distribution-${parameter}`, element, component: DISTRIBUTION_PARAMETER_ENTRIES[parameter], isEdited: isTextFieldEntryEdited });
    }
  }
  return { id: 'synthea-set-attribute', label: 'Set Attribute', entries };
}

function createAssignToAttributeGroup(element) {
  return {
    id: 'synthea-assign-to-attribute',
    label: 'Assign to Attribute',
    entries: [
      { id: 'synthea-assign-to-attribute-value', element, component: AssignToAttributeEntry, isEdited: isTextFieldEntryEdited }
    ]
  };
}

// "Names the ended entity by": its code (or, for an end state, the nearest earlier start state),
// or an attribute that an earlier state assigned. The choice is the presence of the config; picking
// the attribute clears the code, picking the code removes the reference.
function createReferencedByAttributeGroup(element) {
  const byAttribute = !!getExtension(element, REFERENCED_BY_ATTRIBUTE_TYPE);
  const entries = [{ id: 'synthea-referenced-by-attribute-mode', element, component: ReferencedByModeEntry }];
  if (byAttribute) {
    entries.push({ id: 'synthea-referenced-by-attribute-value', element, component: ReferencedByAttributeEntry, isEdited: isTextFieldEntryEdited });
  }
  return { id: 'synthea-referenced-by-attribute', label: 'Referenced by Attribute', entries };
}

function ReferencedByModeEntry(props) {
  const { element, id } = props;
  const modeling = useService('modeling');
  const bpmnFactory = useService('bpmnFactory');
  const translate = useService('translate');

  const death = stateTypeOf(element) === 'Death';
  const getValue = () => (getExtension(element, REFERENCED_BY_ATTRIBUTE_TYPE) ? 'ATTRIBUTE' : 'CODE');

  const setValue = (value) => {
    if (value === 'ATTRIBUTE') {
      ensureExtension(element, REFERENCED_BY_ATTRIBUTE_TYPE, bpmnFactory, modeling);
      const state = getExtension(element, STATE_TYPE);
      if (state) {
        modeling.updateModdleProperties(element, state, { codeSystem: undefined, code: undefined, codeDisplay: undefined });
      }
      return;
    }
    const extensionElements = getBusinessObject(element).get('extensionElements');
    const reference = (extensionElements?.get('values') || []).find((v) => is(v, REFERENCED_BY_ATTRIBUTE_TYPE));
    if (reference) {
      modeling.updateModdleProperties(element, extensionElements, {
        values: extensionElements.get('values').filter((v) => v !== reference)
      });
    }
  };

  const getOptions = () => [
    { value: 'CODE', label: translate(death ? 'Code of the cause (optional)' : 'Code, or the nearest earlier start state') },
    { value: 'ATTRIBUTE', label: translate('Attribute set by an earlier state') }
  ];

  return SelectEntry({ element, id, label: translate(death ? 'Cause of death by' : 'Names the ended entity by'), getValue, setValue, getOptions });
}

// --- generic flat-extension entry factories -----------------------------

function makeTextEntry(type, prop, label, options = {}) {
  return function Entry(props) {
    const { element, id } = props;
    const modeling = useService('modeling');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');

    const getValue = () => {
      const config = getExtension(element, type);
      const value = config ? config.get(prop) : undefined;
      return value === undefined || value === null ? '' : String(value);
    };

    const setValue = (value) => {
      const config = ensureExtension(element, type, bpmnFactory, modeling, options.defaults);
      const parsed = options.parse && value !== '' ? options.parse(value) : (value === '' ? undefined : value);
      modeling.updateModdleProperties(element, config, { [prop]: parsed });
    };

    return TextFieldEntry({ element, id, label: translate(label), getValue, setValue, debounce });
  };
}

// --- State type entry (kept bespoke: falls back to "no selection" instead
//     of removing the extension) ----------------------------------------

function StateTypeEntry(props) {
  const { element, id } = props;
  const modeling = useService('modeling');
  const bpmnFactory = useService('bpmnFactory');
  const translate = useService('translate');

  const getValue = () => {
    const config = getExtension(element, STATE_TYPE);
    return config ? config.get('stateType') || '' : '';
  };

  const setValue = (value) => {
    if (!value) {
      const config = getExtension(element, STATE_TYPE);
      if (config) {
        modeling.updateModdleProperties(element, config, { stateType: undefined });
      }
      return;
    }
    const config = ensureExtension(element, STATE_TYPE, bpmnFactory, modeling);
    modeling.updateModdleProperties(element, config, { stateType: value });
  };

  const getOptions = () => {
    const values = stateTypeValuesFor(element);
    const current = getValue();

    // a value that is already set stays selectable, even if the converter would reject it
    return [
      { value: '', label: translate('<none — falls back to inferred signals>') },
      ...(current && !values.includes(current) ? [current] : []).concat(values).map((v) => ({ value: v, label: v }))
    ];
  };

  return SelectEntry({ element, id, label: translate('State Type'), getValue, setValue, getOptions });
}

// --- Probability entries --------------------------------------------------

const ProbabilityKindEntry = makeKindSelectEntry(PROBABILITY_TYPE, 'probabilityKind', 'Probability as', [
  { value: 'FIXED', label: 'Fixed number' },
  { value: 'ATTRIBUTE', label: 'Value of a patient attribute' }
], PROBABILITY_KIND_FIELDS, 'FIXED');
const ProbabilityEntry = makeTextEntry(PROBABILITY_TYPE, 'probability', 'Probability (0.0 - 1.0)', { parse: parseFloat });
const ProbabilityAttributeEntry = makeTextEntry(PROBABILITY_TYPE, 'probabilityAttribute', 'Attribute that holds the probability');
const ProbabilityDefaultEntry = makeTextEntry(PROBABILITY_TYPE, 'probabilityDefault', 'Default probability (used when the attribute is not set; required)', { parse: parseFloat });

// --- Flow condition entries (synthea:ConditionConfig on sequence flows,
//     for conditional_transition) -----------------------------------------

function getFlowCondition(element) {
  const cfg = getExtension(element, CONDITION_CONFIG_TYPE);
  return cfg ? cfg.get('condition') || null : null;
}

function ensureFlowCondition(element, bpmnFactory, modeling) {
  const cfg = ensureExtension(element, CONDITION_CONFIG_TYPE, bpmnFactory, modeling);

  let condition = cfg.get('condition');
  if (!condition) {
    condition = bpmnFactory.create('synthea:Condition', {});
    condition.$parent = cfg;
    modeling.updateModdleProperties(element, cfg, { condition });
  }

  return condition;
}

function makeNestedConditionTextEntry(getCondition, ensureCondition, prop, label, options = {}) {
  return function Entry(props) {
    const { element, id } = props;
    const modeling = useService('modeling');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');
    const debounce = useService('debounceInput');

    const getValue = () => {
      const condition = getCondition(element);
      const value = condition ? condition.get(prop) : undefined;
      return value === undefined || value === null ? '' : String(value);
    };

    const setValue = (value) => {
      const condition = ensureCondition(element, bpmnFactory, modeling);
      const parsed = options.parse && value !== '' ? options.parse(value) : (value === '' ? undefined : value);
      modeling.updateModdleProperties(element, condition, { [prop]: parsed });
    };

    return TextFieldEntry({ element, id, label: translate(label), getValue, setValue, debounce });
  };
}

function makeNestedConditionSelectEntry(getCondition, ensureCondition, prop, label, values, noneLabel = '<none — falls back to inferred signals>') {
  return function Entry(props) {
    const { element, id } = props;
    const modeling = useService('modeling');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');

    const getValue = () => {
      const condition = getCondition(element);
      return condition ? condition.get(prop) || '' : '';
    };

    const setValue = (value) => {
      const condition = ensureCondition(element, bpmnFactory, modeling);
      modeling.updateModdleProperties(element, condition, { [prop]: value || undefined });
    };

    const getOptions = () => [
      { value: '', label: translate(noneLabel) },
      ...values.map((v) => (typeof v === 'string' ? { value: v, label: v } : v))
    ];

    return SelectEntry({ element, id, label: translate(label), getValue, setValue, getOptions });
  };
}

function makeNestedConditionCheckboxEntry(getCondition, ensureCondition, prop, label) {
  return function Entry(props) {
    const { element, id } = props;
    const modeling = useService('modeling');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');

    const getValue = () => {
      const condition = getCondition(element);
      return condition ? !!condition.get(prop) : false;
    };

    const setValue = (value) => {
      const condition = ensureCondition(element, bpmnFactory, modeling);
      modeling.updateModdleProperties(element, condition, { [prop]: !!value });
    };

    return CheckboxEntry({ element, id, label: translate(label), getValue, setValue });
  };
}

// Builds the full set of per-field entry components for a given condition
// accessor pair (top-level Flow/Guard condition, or a nested slot's
// accessor from makeNestedConditionAccessor below) — shared so the nested
// combinator slots don't need their own hand-written field list.
function buildConditionFieldEntries(getCondition, ensureCondition) {
  return {
    attribute: makeNestedConditionTextEntry(getCondition, ensureCondition, 'attribute', 'Attribute name'),
    operator: makeNestedConditionTextEntry(getCondition, ensureCondition, 'operator', 'Operator (e.g. <=, ==, >)'),
    value: makeNestedConditionTextEntry(getCondition, ensureCondition, 'value', 'Value'),
    gender: makeNestedConditionTextEntry(getCondition, ensureCondition, 'gender', 'Gender (M/F)'),
    race: makeNestedConditionTextEntry(getCondition, ensureCondition, 'race', 'Race'),
    category: makeNestedConditionTextEntry(getCondition, ensureCondition, 'category', 'Category (High/Middle/Low)'),
    quantity: makeNestedConditionTextEntry(getCondition, ensureCondition, 'quantity', 'Quantity (Age threshold, or PriorState "within" duration)', { parse: parseFloat }),
    unit: makeNestedConditionTextEntry(getCondition, ensureCondition, 'unit', 'Unit (e.g. years — Age threshold, or PriorState "within" duration)'),
    year: makeNestedConditionTextEntry(getCondition, ensureCondition, 'year', 'Year', { parse: parseInt }),
    month: makeNestedConditionTextEntry(getCondition, ensureCondition, 'month', 'Month', { parse: parseInt }),
    symptom: makeNestedConditionTextEntry(getCondition, ensureCondition, 'symptom', 'Symptom name'),
    vitalSign: makeNestedConditionTextEntry(getCondition, ensureCondition, 'vitalSign', 'Vital sign name'),
    referencedAttribute: makeNestedConditionTextEntry(getCondition, ensureCondition, 'referencedAttribute', 'Referenced attribute (entity to check)'),
    codeSystem: makeNestedConditionSelectEntry(getCondition, ensureCondition, 'codeSystem', 'Code system (alternative to attribute)', CODE_SYSTEM_OPTIONS, '<none>'),
    code: makeNestedConditionTextEntry(getCondition, ensureCondition, 'code', 'Code (e.g. 20570-8)'),
    codeDisplay: makeNestedConditionTextEntry(getCondition, ensureCondition, 'codeDisplay', 'Code display text (required with a code)'),
    priorStateName: makeNestedConditionTextEntry(getCondition, ensureCondition, 'priorStateName', 'Prior state name'),
    since: makeNestedConditionTextEntry(getCondition, ensureCondition, 'since', 'Since (State_Name, optional)'),
    minimum: makeNestedConditionTextEntry(getCondition, ensureCondition, 'minimum', 'Minimum (how many sub-conditions must hold)', { parse: parseInt }),
    maximum: makeNestedConditionTextEntry(getCondition, ensureCondition, 'maximum', 'Maximum (how many sub-conditions may hold)', { parse: parseInt })
  };
}

// A nested sub-condition's accessor: the Nth entry of the parent condition's
// `conditions` list. Slots are filled in order — ensuring slot N pads the
// list up to N with empty placeholder Conditions if earlier slots were
// skipped, so fill slot 0 before slot 1, etc.
function makeNestedConditionAccessor(getParentCondition, ensureParentCondition, index) {
  function getCondition(element) {
    const parent = getParentCondition(element);
    const list = parent ? parent.get('conditions') || [] : [];
    return list[index] || null;
  }

  function ensureCondition(element, bpmnFactory, modeling) {
    const parent = ensureParentCondition(element, bpmnFactory, modeling);
    let list = parent.get('conditions') || [];

    if (list.length <= index) {
      list = list.slice();
      while (list.length <= index) {
        const child = bpmnFactory.create('synthea:Condition', {});
        child.$parent = parent;
        list.push(child);
      }
      modeling.updateModdleProperties(element, parent, { conditions: list });
    }

    return parent.get('conditions')[index];
  }

  return { getCondition, ensureCondition };
}

function createNestedConditionGroups(element, getRootCondition, ensureRootCondition, idPrefix) {
  const rootType = getRootCondition(element)?.get('conditionType');

  if (!isCombinatorConditionType(rootType)) {
    return [];
  }

  const groups = [];

  for (let index = 0; index < MAX_NESTED_CONDITIONS; index++) {
    const { getCondition, ensureCondition } = makeNestedConditionAccessor(getRootCondition, ensureRootCondition, index);
    const fieldEntries = buildConditionFieldEntries(getCondition, ensureCondition);
    const nestedType = getCondition(element)?.get('conditionType');
    const fields = getRelevantConditionFields(nestedType);

    const entries = [
      {
        id: `${idPrefix}-nested-${index}-type`,
        element,
        component: makeNestedConditionSelectEntry(getCondition, ensureCondition, 'conditionType', 'Condition type', CONDITION_TYPE_VALUES)
      }
    ];

    fields.forEach((field) => {
      entries.push({
        id: `${idPrefix}-nested-${index}-${field}`,
        element,
        component: fieldEntries[field],
        isEdited: isTextFieldEntryEdited
      });
    });

    entries.push({
      id: `${idPrefix}-nested-${index}-negate`,
      element,
      component: makeNestedConditionCheckboxEntry(getCondition, ensureCondition, 'negate', 'Negate (Not)')
    });

    groups.push({
      id: `${idPrefix}-nested-${index}`,
      label: `Sub-condition ${index + 1}`,
      entries
    });
  }

  return groups;
}

const FlowConditionTypeEntry = makeNestedConditionSelectEntry(getFlowCondition, ensureFlowCondition, 'conditionType', 'Condition type', CONDITION_TYPE_VALUES);
const FlowConditionNegateEntry = makeNestedConditionCheckboxEntry(getFlowCondition, ensureFlowCondition, 'negate', 'Negate (Not)');

const FLOW_CONDITION_FIELD_ENTRIES = buildConditionFieldEntries(getFlowCondition, ensureFlowCondition);

function kindOf(config, kindProp, fieldsByKind, fallback) {
  if (!config) return fallback;
  const stored = config.get(kindProp);
  if (stored) return stored;
  const set = (name) => { const v = config.get(name); return v !== undefined && v !== null && v !== '' && v !== false; };
  return Object.keys(fieldsByKind).find((kind) => fieldsByKind[kind].some(set)) ?? fallback;
}

function makeKindSelectEntry(type, kindProp, label, options, fieldsByKind, fallback) {
  return function Entry(props) {
    const { element, id } = props;
    const modeling = useService('modeling');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');

    const getValue = () => kindOf(getExtension(element, type), kindProp, fieldsByKind, fallback);

    const setValue = (value) => {
      const config = ensureExtension(element, type, bpmnFactory, modeling);
      const cleared = {};
      for (const [kind, fields] of Object.entries(fieldsByKind)) {
        if (kind !== value) for (const field of fields) cleared[field] = undefined;
      }
      modeling.updateModdleProperties(element, config, { ...cleared, [kindProp]: value });
    };

    const getOptions = () => options.map((o) => ({ value: o.value, label: translate(o.label) }));

    return SelectEntry({ element, id, label: translate(label), getValue, setValue, getOptions });
  };
}

// `clears` maps a chosen value to the fields of the same config that no longer apply and are
// cleared with it (a high value on an exact value, for example).
function makeSelecetEntry(type, prop, label, values, clears = {}) {
  return function Entry(props) {
    const { element, id } = props;
    const modeling = useService('modeling');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');

    const getValue = () => {
      const config = getExtension(element, type);
      return config ? config.get(prop) || '' : '';
    };

    const setValue = (value) => {
      const cleared = Object.fromEntries((clears[value || ''] ?? []).map((field) => [field, undefined]));
      if (!value) {
        const config = getExtension(element, type);
        if (config) {
          modeling.updateModdleProperties(element, config, { [prop]: undefined, ...cleared });
        }
        return;
      }
      const config = ensureExtension(element, type, bpmnFactory, modeling);
      modeling.updateModdleProperties(element, config, { [prop]: value, ...cleared });
    };

    const getOptions = () => [
      { value: '', label: translate('<none>') },
      ...values.map((v) => (typeof v === 'string' ? { value: v, label: v } : v))
    ];

    return SelectEntry({ element, id, label: translate(label), getValue, setValue, getOptions });
  };
}

const DelayShapeEntry = makeSelecetEntry(DELAY_TYPE, 'delayShape', 'Delay shape', DELAY_SHAPE_VALUES, { EXACT: ['delayValueHigh'], '': ['delayValueHigh'] });
const DelayValueEntry = makeTextEntry(DELAY_TYPE, 'delayValue', 'Delay value (exact value, or range low)');
const DelayValueHighEntry = makeTextEntry(DELAY_TYPE, 'delayValueHigh', 'Delay value, high (range high, only for RANGE)');
const DelayUnitEntry = makeTextEntry(DELAY_TYPE, 'delayUnit', 'Delay unit');

function getGuardCondition(element) {
  const cfg = getExtension(element, GUARD_TYPE);
  return cfg ? cfg.get('allow') || null : null;
}

function ensureGuardCondition(element, bpmnFactory, modeling) {
  const cfg = ensureExtension(element, GUARD_TYPE, bpmnFactory, modeling);

  let allow = cfg.get('allow');
  if (!allow) {
    allow = bpmnFactory.create('synthea:Condition', {});
    allow.$parent = cfg;
    modeling.updateModdleProperties(element, cfg, { allow });
  }

  return allow;
}

const GuardConditionTypeEntry = makeNestedConditionSelectEntry(getGuardCondition, ensureGuardCondition, 'conditionType', 'Condition type', CONDITION_TYPE_VALUES);
const GuardConditionNegateEntry = makeNestedConditionCheckboxEntry(getGuardCondition, ensureGuardCondition, 'negate', 'Negate (Not)');

const GUARD_CONDITION_FIELD_ENTRIES = buildConditionFieldEntries(getGuardCondition, ensureGuardCondition);

// `clearedWhenOn`: fields of the same config that no longer apply once the box is ticked.
function makeCheckboxEntry(type, prop, label, clearedWhenOn = []) {
  return function Entry(props) {
    const { element, id } = props;
    const modeling = useService('modeling');
    const bpmnFactory = useService('bpmnFactory');
    const translate = useService('translate');

    const getValue = () => {
      const config = getExtension(element, type);
      return config ? !!config.get(prop) : false;
    };

    const setValue = (value) => {
      const config = ensureExtension(element, type, bpmnFactory, modeling);
      const cleared = value ? Object.fromEntries(clearedWhenOn.map((field) => [field, undefined])) : {};
      modeling.updateModdleProperties(element, config, { [prop]: !!value, ...cleared });
    };

    return CheckboxEntry({ element, id, label: translate(label), getValue, setValue });
  };
}

const SubmoduleEntry = makeTextEntry(SUBMODULE_TYPE, 'submodule', 'Submodule reference');
const EncounterContextEntry = makeCheckboxEntry(ENCOUNTER_CONTEXT_TYPE, 'requiresEncounterContext', 'Encounter context');
const EncounterIdEntry = makeTextEntry(ENCOUNTER_CONTEXT_TYPE, 'encounterId', 'Encounter ID (groups states into one encounter)');
const EncounterWellnessEntry = makeCheckboxEntry(ENCOUNTER_CONTEXT_TYPE, 'wellness', 'Wellness encounter',
  ['encounterClass', 'encounterCodeSystem', 'encounterCode', 'encounterCodeDisplay']);
const EncounterClassEntry = makeSelecetEntry(ENCOUNTER_CONTEXT_TYPE, 'encounterClass', 'Encounter class (required for non-wellness encounters)', ENCOUNTER_CLASS_VALUES);
const EncounterReasonEntry = makeTextEntry(ENCOUNTER_CONTEXT_TYPE, 'reason', 'Reason (attribute name or State_Name)');
const EncounterReferenceEntry = makeTextEntry(ENCOUNTER_REFERENCE_TYPE, 'targetEncounter', 'Encounter reference');
const CounterAttributeEntry = makeTextEntry(COUNTER_TYPE, 'attribute', 'Attribute name');
const CounterActionEntry = makeSelecetEntry(COUNTER_TYPE, 'action', 'Action', COUNTER_ACTION_VALUES);
const CodeSystemEntry = makeSelecetEntry(STATE_TYPE, 'codeSystem', 'Code system', CODE_SYSTEM_OPTIONS);
const CodeValueEntry = makeTextEntry(STATE_TYPE, 'code', 'Code');
const CodeDisplayEntry = makeTextEntry(STATE_TYPE, 'codeDisplay', 'Display text');
const EncounterCodeSystemEntry = makeSelecetEntry(ENCOUNTER_CONTEXT_TYPE, 'encounterCodeSystem', 'Encounter code system (e.g. SNOMED CT)', CODE_SYSTEM_OPTIONS);
const EncounterCodeEntry = makeTextEntry(ENCOUNTER_CONTEXT_TYPE, 'encounterCode', 'Encounter code (e.g. 185347001)');
const EncounterCodeDisplayEntry = makeTextEntry(ENCOUNTER_CONTEXT_TYPE, 'encounterCodeDisplay', 'Encounter code display text');

const SymptomNameEntry = makeTextEntry(SYMPTOM_TYPE, 'symptom', 'Symptom name (e.g. Cough)');
const ObservationCategoryEntry = makeSelecetEntry(OBSERVATION_TYPE, 'category', 'Observation category', OBSERVATION_CATEGORY_VALUES);
const ValueShapeEntry = makeSelecetEntry(VALUE_TYPE, 'valueShape', 'Value: exact or range', ['EXACT', 'RANGE'], { EXACT: ['valueHigh'], '': ['valueHigh'] });
const ValueEntry = makeTextEntry(VALUE_TYPE, 'value', 'Value (EXACT) / lowest value (RANGE)', { parse: parseFloat });
const ValueHighEntry = makeTextEntry(VALUE_TYPE, 'valueHigh', 'Highest value (RANGE only)', { parse: parseFloat });
const ValueDecimalsEntry = makeTextEntry(VALUE_TYPE, 'decimals', 'Decimals (optional)', { parse: parseInt });
const ValueUnitObservationEntry = makeTextEntry(VALUE_TYPE, 'unit', 'Unit (e.g. {score}, mg/dL)');
const ValueUnitTimeEntry = makeTextEntry(VALUE_TYPE, 'unit', 'Unit of time (years, months, weeks, days, …)');

const SeriesBodySiteCodeEntry = makeTextEntry(SERIES_TYPE, 'bodySiteCode', 'Body site code (SNOMED CT)');
const SeriesBodySiteDisplayEntry = makeTextEntry(SERIES_TYPE, 'bodySiteDisplay', 'Body site display text');
const SeriesModalityCodeEntry = makeTextEntry(SERIES_TYPE, 'modalityCode', 'Modality code (DICOM, e.g. CT)');
const SeriesModalityDisplayEntry = makeTextEntry(SERIES_TYPE, 'modalityDisplay', 'Modality display text');
const SeriesInstanceTitleEntry = makeTextEntry(SERIES_TYPE, 'instanceTitle', 'Image title');
const SeriesSopClassCodeEntry = makeTextEntry(SERIES_TYPE, 'sopClassCode', 'SOP class code (DICOM)');
const SeriesSopClassDisplayEntry = makeTextEntry(SERIES_TYPE, 'sopClassDisplay', 'SOP class display text');
const SeriesMinInstancesEntry = makeTextEntry(SERIES_TYPE, 'minInstances', 'Min. number of instances (optional)', { parse: parseInt });
const MedicationAdministrationEntry = makeCheckboxEntry(MEDICATION_TYPE, 'administration', 'Administered during the encounter (inpatient), not only prescribed');
const ActivityCodeEntry = makeTextEntry(ACTIVITY_TYPE, 'code', 'SNOMED code of the activity');
const ActivityDisplayEntry = makeTextEntry(ACTIVITY_TYPE, 'codeDisplay', 'Display text of the activity');
const SeriesMaxInstancesEntry = makeTextEntry(SERIES_TYPE, 'maxInstances', 'Max. number of instances (optional)', { parse: parseInt });

const CounterAmountEntry = makeTextEntry(COUNTER_TYPE, 'amount', 'Amount (default 1)', { parse: parseFloat });
const SetAttributeKindEntry = makeKindSelectEntry(SET_ATTRIBUTE_TYPE, 'valueKind', 'Value as', [
  { value: 'VALUE', label: 'Fixed value' },
  { value: 'ATTRIBUTE', label: 'Copy of another attribute' },
  { value: 'DISTRIBUTION', label: 'Drawn from a distribution' }
], SET_ATTRIBUTE_KIND_FIELDS, 'VALUE');
const SetAttributeEntry = makeTextEntry(SET_ATTRIBUTE_TYPE, 'attribute', 'Attribute name');
const SetAttributeValueEntry = makeTextEntry(SET_ATTRIBUTE_TYPE, 'value', 'Value (number, true/false or text)');
const SetAttributeValueAttributeEntry = makeTextEntry(SET_ATTRIBUTE_TYPE, 'valueAttribute', 'Attribute to copy the value from');

const DistributionKindEntry = makeSelecetEntry(SET_ATTRIBUTE_TYPE, 'distribution', 'Distribution', DISTRIBUTION_KINDS);
const DistributionRoundEntry = makeCheckboxEntry(SET_ATTRIBUTE_TYPE, 'distributionRound', 'Round to a whole number');
const distributionParameter = (prop, label) => makeTextEntry(SET_ATTRIBUTE_TYPE, prop, label, { parse: parseFloat });
const DISTRIBUTION_PARAMETER_ENTRIES = {
  value: distributionParameter('distributionValue', 'Value'),
  mean: distributionParameter('distributionMean', 'Mean'),
  standardDeviation: distributionParameter('distributionStandardDeviation', 'Standard deviation'),
  min: distributionParameter('distributionMin', 'Minimum (optional)'),
  max: distributionParameter('distributionMax', 'Maximum (optional)'),
  low: distributionParameter('distributionLow', 'Lowest value'),
  high: distributionParameter('distributionHigh', 'Highest value')
};
const AssignToAttributeEntry = makeTextEntry(ASSIGN_TO_ATTRIBUTE_TYPE, 'attribute', 'Assign result to attribute');
const ReferencedByAttributeEntry = makeTextEntry(REFERENCED_BY_ATTRIBUTE_TYPE, 'attribute', 'Reference the attribute set by an earlier Assign to Attribute');

// --- moddle helpers --------------------------------------------------------

const stateTypeOf = (element) => getExtension(element, STATE_TYPE)?.get('stateType');

// Groups for the fields only some state types have (Synthea requires them for
// Symptom, Observation, ImagingStudy; Death may carry a time span).
function createStateDetailGroups(element) {
  const type = stateTypeOf(element);
  const groups = [];

  if (type === 'Symptom') {
    groups.push({
      id: 'synthea-symptom',
      label: 'Symptom',
      entries: [{ id: 'synthea-symptom-name', element, component: SymptomNameEntry, isEdited: isTextFieldEntryEdited }]
    });
  }

  if (type === 'Observation' || type === 'MultiObservation') {
    groups.push({
      id: 'synthea-observation',
      label: 'Observation',
      entries: [{ id: 'synthea-observation-category', element, component: ObservationCategoryEntry }]
    });
  }

  if (type === 'Observation' || type === 'Symptom' || type === 'Death' || type === 'Procedure') {
    groups.push(createValueGroup(element, type));
  }

  if (type === 'MedicationOrder') {
    groups.push({
      id: 'synthea-medication',
      label: 'Medication',
      entries: [{ id: 'synthea-medication-administration', element, component: MedicationAdministrationEntry }]
    });
  }

  if (type === 'CarePlanStart') {
    groups.push(createCarePlanActivityGroup(element));
  }

  if (type === 'ImagingStudy') {
    groups.push(createImagingSeriesGroup(element));
  }

  if (type === 'DiagnosticReport' || type === 'MultiObservation') {
    groups.push(createReportObservationsGroup(element));
  }

  return groups;
}

// The value an Observation records, the severity a Symptom gets, (Death) the
// time span until the patient dies, or (Procedure) how long the procedure takes. EXACT is one number, RANGE a low/high pair.
function createValueGroup(element, type) {
  const shape = getExtension(element, VALUE_TYPE)?.get('valueShape');
  const entries = [
    { id: 'synthea-value-shape', element, component: ValueShapeEntry },
    { id: 'synthea-value-value', element, component: ValueEntry, isEdited: isTextFieldEntryEdited }
  ];

  if (shape === 'RANGE') {
    entries.push({ id: 'synthea-value-high', element, component: ValueHighEntry, isEdited: isTextFieldEntryEdited });
  }
  if (type === 'Observation') {
    entries.push({ id: 'synthea-value-unit', element, component: ValueUnitObservationEntry, isEdited: isTextFieldEntryEdited });
    entries.push({ id: 'synthea-value-decimals', element, component: ValueDecimalsEntry, isEdited: isTextFieldEntryEdited });
  }
  if (type === 'Death' || type === 'Procedure') {
    entries.push({ id: 'synthea-value-unit', element, component: ValueUnitTimeEntry, isEdited: isTextFieldEntryEdited });
  }

  const label = type === 'Death' ? 'Time until death' : type === 'Procedure' ? 'Duration (optional)' : 'Value';
  return { id: 'synthea-value', label, entries };
}

// The single values a lab report (DiagnosticReport) contains. There can be a dozen
// or more, each with code, category, unit and a value, so the panel only lists
// them; they are maintained as repeated synthea:reportObservation elements in the
// XML (modeling guide, section 6). The values are a modeling decision and cannot
// be derived from the LOINC code of the panel.
function reportObservationSummary(element) {
  const values = getBusinessObject(element).extensionElements?.values ?? [];
  return values
    .filter((v) => v.$type === 'synthea:ReportObservation')
    .map((o) => {
      const value = o.valueCode
        ? o.valueCodeDisplay
        : o.vitalSign
          ? `vital sign "${o.vitalSign}"`
          : o.valueShape === 'RANGE' ? `${o.value}–${o.valueHigh}` : o.value;
      return `${o.code} ${o.codeDisplay ?? ''} | ${o.unit ?? ''} | ${value ?? ''}`;
    });
}

function ReportObservationsEntry(props) {
  const { element, id } = props;
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const lines = reportObservationSummary(element);

  return TextAreaEntry({
    element,
    id,
    label: translate(`Contained observations (${lines.length}) — read-only, edit synthea:reportObservation in the XML`),
    getValue: () => lines.join('\n'),
    setValue: () => {},
    debounce,
    rows: Math.min(Math.max(lines.length, 3), 12),
    disabled: true
  });
}

function createReportObservationsGroup(element) {
  return {
    id: 'synthea-report-observations',
    label: 'Report observations',
    entries: [{ id: 'synthea-report-observations-list', element, component: ReportObservationsEntry }]
  };
}

// One activity of a care plan; further activities can be added in the XML.
function createCarePlanActivityGroup(element) {
  return {
    id: 'synthea-careplan-activity',
    label: 'Care plan activity',
    entries: [
      { id: 'synthea-activity-code', element, component: ActivityCodeEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-activity-display', element, component: ActivityDisplayEntry, isEdited: isTextFieldEntryEdited }
    ]
  };
}

// One series with one kind of image; further series can be added in the XML.
function createImagingSeriesGroup(element) {
  const edited = isTextFieldEntryEdited;
  return {
    id: 'synthea-imaging-series',
    label: 'Imaging series',
    entries: [
      { id: 'synthea-series-body-site-code', element, component: SeriesBodySiteCodeEntry, isEdited: edited },
      { id: 'synthea-series-body-site-display', element, component: SeriesBodySiteDisplayEntry, isEdited: edited },
      { id: 'synthea-series-modality-code', element, component: SeriesModalityCodeEntry, isEdited: edited },
      { id: 'synthea-series-modality-display', element, component: SeriesModalityDisplayEntry, isEdited: edited },
      { id: 'synthea-series-instance-title', element, component: SeriesInstanceTitleEntry, isEdited: edited },
      { id: 'synthea-series-sop-class-code', element, component: SeriesSopClassCodeEntry, isEdited: edited },
      { id: 'synthea-series-sop-class-display', element, component: SeriesSopClassDisplayEntry, isEdited: edited },
      { id: 'synthea-series-min', element, component: SeriesMinInstancesEntry, isEdited: edited },
      { id: 'synthea-series-max', element, component: SeriesMaxInstancesEntry, isEdited: edited }
    ]
  };
}

function isConditionOrAllergyOnset(element) {
  const config = getExtension(element, STATE_TYPE);
  const stateType = config ? config.get('stateType') : undefined;

  return stateType === 'ConditionOnset' || stateType === 'AllergyOnset';
}

// Is a group relevant for the chosen state type? With no state type chosen nothing is hidden
// (the type is then inferred), and a group that already holds a value is never hidden.
function appliesTo(element, stateTypes, configType) {
  const type = stateTypeOf(element);
  if (!type || stateTypes.includes(type)) {
    return true;
  }
  return !!getExtension(element, configType);
}

function getExtension(element, type) {
  const extensionElements = getBusinessObject(element).get('extensionElements');
  if (!extensionElements) {
    return null;
  }
  return (extensionElements.get('values') || []).find((v) => is(v, type)) || null;
}

function ensureExtension(element, type, bpmnFactory, modeling, defaults) {
  const businessObject = getBusinessObject(element);

  let extensionElements = businessObject.get('extensionElements');
  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = businessObject;
    modeling.updateProperties(element, { extensionElements });
  }

  let config = (extensionElements.get('values') || []).find((v) => is(v, type));
  if (!config) {
    config = bpmnFactory.create(type, defaults || {});
    config.$parent = extensionElements;
    modeling.updateModdleProperties(element, extensionElements, {
      values: [...(extensionElements.get('values') || []), config]
    });
  }

  return config;
}
