import { is, getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';
import {
  TextFieldEntry,
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
const SET_ATTRIBUTE_TYPE = 'synthea:SetAttributeConfig';
const ASSIGN_TO_ATTRIBUTE_TYPE = 'synthea:AssignToAttributeConfig';
const REFERENCED_BY_ATTRIBUTE_TYPE = 'synthea:ReferencedByAttributeConfig';

const DELAY_SHAPE_VALUES = ['EXACT', 'RANGE'];
const COUNTER_ACTION_VALUES = ['increment', 'decrement'];
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
  'Observation': ['referencedAttribute', 'operator', 'value'],
  'Vital Sign': ['vitalSign', 'operator', 'value'],
  'Active Condition': ['referencedAttribute'],
  'Active Medication': ['referencedAttribute'],
  'Active Allergy': ['referencedAttribute'],
  'Active CarePlan': ['referencedAttribute'],
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

const STATE_TYPE_VALUES = [
  'Initial', 'Terminal', 'Simple', 'Guard', 'Delay', 'SetAttribute', 'Counter',
  'CallSubmodule', 'ConditionOnset', 'ConditionEnd',
  'AllergyOnset', 'AllergyEnd', 'MedicationOrder', 'MedicationEnd', 'CarePlanStart',
  'CarePlanEnd', 'Procedure', 'ImagingStudy', 'Device', 'DeviceEnd', 'SupplyList',
  'VitalSign', 'Observation', 'MultiObservation', 'DiagnosticReport', 'Symptom',
  'Death', 'Physiology'
];


export default function SyntheaMiniPropertiesProvider(propertiesPanel, injector) {
  this.getGroups = function (element) {
    return function (groups) {

      if (is(element, 'bpmn:EndEvent')) {
        groups.push(createStateTypeGroup(element));
        groups.push(createEncounterContextGroup(element));
        groups.push(createReferencedByAttributeGroup(element));
      }

      if (is(element, 'bpmn:Task')) {
        groups.push(createStateTypeGroup(element));
        groups.push(createEncounterContextGroup(element));
        groups.push(createCounterGroup(element));
        groups.push(createSetAttributeGroup(element));
        groups.push(createAssignToAttributeGroup(element));
        groups.push(createReferencedByAttributeGroup(element));

        if (isConditionOrAllergyOnset(element)) {
          groups.push(createEncounterReferenceGroup(element));
        }
      }

      if (is(element, 'bpmn:SubProcess') || is(element, 'bpmn:CallActivity')) {
        groups.push(createStateTypeGroup(element));
        groups.push(createEncounterContextGroup(element));
      }

      if (is(element, 'bpmn:IntermediateCatchEvent') || is(element, 'bpmn:IntermediateThrowEvent')) {
        groups.push(createStateTypeGroup(element));
        groups.push(createDelayGroup(element));
        groups.push(createEncounterContextGroup(element));
        groups.push(createAssignToAttributeGroup(element));
        groups.push(createReferencedByAttributeGroup(element));

        if (isConditionOrAllergyOnset(element)) {
          groups.push(createEncounterReferenceGroup(element));
        }
      }

      if (is(element, 'bpmn:SequenceFlow')) {
        groups.push(createProbabilityGroup(element));
        groups.push(createConditionGroup(element));
        groups.push(...createNestedConditionGroups(element, getFlowCondition, ensureFlowCondition, 'synthea-condition'));
      }

      if (is(element, 'bpmn:ExclusiveGateway') || is(element, 'bpmn:InclusiveGateway')) {
        groups.push(createGuardGroup(element));
        groups.push(...createNestedConditionGroups(element, getGuardCondition, ensureGuardCondition, 'synthea-guard-condition'));
      }

      if (is(element, 'bpmn:TextAnnotation')) {
        groups.push(createEncounterContextGroup(element));
        groups.push(createAssignToAttributeGroup(element));
        groups.push(createReferencedByAttributeGroup(element));
      }

      if (is(element, 'bpmn:CallActivity')) {
        groups.push(createSubmoduleGroup(element));
      }

      return groups;
    };
  };

  propertiesPanel.registerProvider(LOW_PRIORITY, this);
}

SyntheaMiniPropertiesProvider.$inject = ['propertiesPanel', 'injector'];

// --- groups ------------------------------------------------------------

function createStateTypeGroup(element) {
  return {
    id: 'synthea-state-type',
    label: 'State type',
    entries: [
      { id: 'synthea-state-type-value', element, component: StateTypeEntry }
    ]
  };
}

function createProbabilityGroup(element) {
  return {
    id: 'synthea-probability',
    label: 'Probability',
    entries: [
      { id: 'synthea-probability-value', element, component: ProbabilityEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-probability-attribute', element, component: ProbabilityAttributeEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-probability-default', element, component: ProbabilityDefaultEntry, isEdited: isTextFieldEntryEdited }
    ]
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

function createSetAttributeGroup(element) {
  return {
    id: 'synthea-set-attribute',
    label: 'Set Attribute',
    entries: [
      { id: 'synthea-set-attribute-value', element, component: SetAttributeEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-set-attribute-assigned-value', element, component: SetAttributeValueEntry, isEdited: isTextFieldEntryEdited }
    ]
  };
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

function createReferencedByAttributeGroup(element) {
  return {
    id: 'synthea-referenced-by-attribute',
    label: 'Referenced by Attribute',
    entries: [
      { id: 'synthea-referenced-by-attribute-value', element, component: ReferencedByAttributeEntry, isEdited: isTextFieldEntryEdited }
    ]
  };
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

  const getOptions = () => [
    { value: '', label: translate('<none — falls back to inferred signals>') },
    ...STATE_TYPE_VALUES.map((v) => ({ value: v, label: v }))
  ];

  return SelectEntry({ element, id, label: translate('Synthea state type'), getValue, setValue, getOptions });
}

// --- Probability entries --------------------------------------------------

const ProbabilityEntry = makeTextEntry(PROBABILITY_TYPE, 'probability', 'Probability (0.0 - 1.0)', { parse: parseFloat });
const ProbabilityAttributeEntry = makeTextEntry(PROBABILITY_TYPE, 'probabilityAttribute', 'Probability attribute (named/dynamic)');
const ProbabilityDefaultEntry = makeTextEntry(PROBABILITY_TYPE, 'probabilityDefault', 'Default probability (if attribute unset)', { parse: parseFloat });

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

function makeNestedConditionSelectEntry(getCondition, ensureCondition, prop, label, values) {
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
      { value: '', label: translate('<none — falls back to inferred signals>') },
      ...values.map((v) => ({ value: v, label: v }))
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

function makeSelecetEntry(type, prop, label, values) {
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
      if (!value) {
        const config = getExtension(element, type);
        if (config) {
          modeling.updateModdleProperties(element, config, { [prop]: undefined });
        }
        return;
      }
      const config = ensureExtension(element, type, bpmnFactory, modeling);
      modeling.updateModdleProperties(element, config, { [prop]: value });
    };

    const getOptions = () => [
      { value: '', label: translate('<none>') },
      ...values.map((v) => ({ value: v, label: v }))
    ];

    return SelectEntry({ element, id, label: translate(label), getValue, setValue, getOptions });
  };
}

const DelayShapeEntry = makeSelecetEntry(DELAY_TYPE, 'delayShape', 'Delay shape', DELAY_SHAPE_VALUES);
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

function makeCheckboxEntry(type, prop, label) {
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
      modeling.updateModdleProperties(element, config, { [prop]: !!value });
    };

    return CheckboxEntry({ element, id, label: translate(label), getValue, setValue });
  };
}

const SubmoduleEntry = makeTextEntry(SUBMODULE_TYPE, 'submodule', 'Submodule reference');
const EncounterContextEntry = makeCheckboxEntry(ENCOUNTER_CONTEXT_TYPE, 'requiresEncounterContext', 'Encounter context');
const EncounterIdEntry = makeTextEntry(ENCOUNTER_CONTEXT_TYPE, 'encounterId', 'Encounter ID (groups states into one encounter)');
const EncounterWellnessEntry = makeCheckboxEntry(ENCOUNTER_CONTEXT_TYPE, 'wellness', 'Wellness encounter');
const EncounterClassEntry = makeSelecetEntry(ENCOUNTER_CONTEXT_TYPE, 'encounterClass', 'Encounter class (required for non-wellness encounters)', ENCOUNTER_CLASS_VALUES);
const EncounterReasonEntry = makeTextEntry(ENCOUNTER_CONTEXT_TYPE, 'reason', 'Reason (attribute name or State_Name)');
const EncounterReferenceEntry = makeTextEntry(ENCOUNTER_REFERENCE_TYPE, 'targetEncounter', 'Encounter reference');
const CounterAttributeEntry = makeTextEntry(COUNTER_TYPE, 'attribute', 'Attribute name');
const CounterActionEntry = makeSelecetEntry(COUNTER_TYPE, 'action', 'Action', COUNTER_ACTION_VALUES);
const CounterAmountEntry = makeTextEntry(COUNTER_TYPE, 'amount', 'Amount (default 1)', { parse: parseFloat });
const SetAttributeEntry = makeTextEntry(SET_ATTRIBUTE_TYPE, 'attribute', 'Attribute name');
const SetAttributeValueEntry = makeTextEntry(SET_ATTRIBUTE_TYPE, 'value', 'Value to assign (numeric, boolean, or string)');
const AssignToAttributeEntry = makeTextEntry(ASSIGN_TO_ATTRIBUTE_TYPE, 'attribute', 'Assign result to attribute');
const ReferencedByAttributeEntry = makeTextEntry(REFERENCED_BY_ATTRIBUTE_TYPE, 'attribute', 'Reference the attribute set by an earlier Assign to Attribute');

// --- moddle helpers --------------------------------------------------------

function isConditionOrAllergyOnset(element) {
  const config = getExtension(element, STATE_TYPE);
  const stateType = config ? config.get('stateType') : undefined;

  return stateType === 'ConditionOnset' || stateType === 'AllergyOnset';
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
