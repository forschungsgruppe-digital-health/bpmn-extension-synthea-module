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

const DELAY_SHAPE_VALUES = ['EXACT', 'RANGE', 'DISTRIBUTION'];
const DELAY_DISTRIBUTION_KIND_VALUES = ['EXACT', 'UNIFORM', 'GAUSSIAN', 'EXPONENTIAL'];

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
      }

      if (is(element, 'bpmn:Task')) {
        groups.push(createStateTypeGroup(element));
        groups.push(createEncounterContextGroup(element));
      }

      if (is(element, 'bpmn:SubProcess') && !is(element, 'bpmn:CallActivity')) {
        groups.push(createStateTypeGroup(element));
        groups.push(createEncounterContextGroup(element));
      }

      if (is(element, 'bpmn:IntermediateCatchEvent') || is(element, 'bpmn:IntermediateThrowEvent')) {
        groups.push(createStateTypeGroup(element));
        groups.push(createDelayGroup(element));
        groups.push(createEncounterReferenceGroup(element));
        groups.push(createEncounterContextGroup(element));
      }

      if (is(element, 'bpmn:SequenceFlow')) {
        groups.push(createProbabilityGroup(element));
        groups.push(createConditionGroup(element));
      }

      if (is(element, 'bpmn:ExclusiveGateway') || is(element, 'bpmn:InclusiveGateway')) {
        groups.push(createGuardGroup(element));
      }

      if (is(element, 'bpmn:TextAnnotation')) {
        groups.push(createEncounterContextGroup(element));
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
    label: 'State type (synthea)',
    entries: [
      { id: 'synthea-state-type-value', element, component: StateTypeEntry }
    ]
  };
}

function createProbabilityGroup(element) {
  return {
    id: 'synthea-probability',
    label: 'Probability (synthea)',
    entries: [
      { id: 'synthea-probability-value', element, component: ProbabilityEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-probability-attribute', element, component: ProbabilityAttributeEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-probability-default', element, component: ProbabilityDefaultEntry, isEdited: isTextFieldEntryEdited }
    ]
  };
}

function createConditionGroup(element) {
  return {
    id: 'synthea-condition',
    label: 'Condition (synthea)',
    entries: [
      { id: 'synthea-condition-type', element, component: FlowConditionTypeEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-condition-attribute', element, component: FlowConditionAttributeEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-condition-operator', element, component: FlowConditionOperatorEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-condition-value', element, component: FlowConditionValueEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-condition-negate', element, component: FlowConditionNegateEntry }
    ]
  };
}

function createDelayGroup(element) {
  return {
    id: 'synthea-delay',
    label: 'Delay (synthea)',
    entries: [
      { id: 'synthea-delay-shape', element, component: DelayShapeEntry },
      { id: 'synthea-delay-value', element, component: DelayValueEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-delay-unit', element, component: DelayUnitEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-delay-distribution-kind', element, component: DelayDistributionKindEntry }
    ]
  };
}

function createGuardGroup(element) {
  return {
    id: 'synthea-guard',
    label: 'Guard (synthea)',
    entries: [
      { id: 'synthea-guard-condition-type', element, component: GuardConditionTypeEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-guard-condition-attribute', element, component: GuardConditionAttributeEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-guard-condition-operator', element, component: GuardConditionOperatorEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-guard-condition-value', element, component: GuardConditionValueEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-guard-condition-negate', element, component: GuardConditionNegateEntry }
    ]
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
  return {
    id: 'synthea-encounter-context',
    label: 'Encounter Context',
    entries: [
      { id: 'synthea-encounter-context-value', element, component: EncounterContextEntry },
      { id: 'synthea-encounter-context-id', element, component: EncounterIdEntry, isEdited: isTextFieldEntryEdited },
      { id: 'synthea-encounter-context-wellness', element, component: EncounterWellnessEntry }
    ]
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

function makeNestedConditionTextEntry(getCondition, ensureCondition, prop, label) {
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
      modeling.updateModdleProperties(element, condition, { [prop]: value });
    };

    return TextFieldEntry({ element, id, label: translate(label), getValue, setValue, debounce });
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

const FlowConditionTypeEntry = makeNestedConditionTextEntry(getFlowCondition, ensureFlowCondition, 'conditionType', 'Condition type (e.g. Attribute, Age, Gender)');
const FlowConditionAttributeEntry = makeNestedConditionTextEntry(getFlowCondition, ensureFlowCondition, 'attribute', 'Attribute name');
const FlowConditionOperatorEntry = makeNestedConditionTextEntry(getFlowCondition, ensureFlowCondition, 'operator', 'Operator (e.g. <=, ==, >)');
const FlowConditionValueEntry = makeNestedConditionTextEntry(getFlowCondition, ensureFlowCondition, 'value', 'Value');
const FlowConditionNegateEntry = makeNestedConditionCheckboxEntry(getFlowCondition, ensureFlowCondition, 'negate', 'Negate (Not)');

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
const DelayValueEntry = makeTextEntry(DELAY_TYPE, 'delayValue', 'Delay value');
const DelayUnitEntry = makeTextEntry(DELAY_TYPE, 'delayUnit', 'Delay unit');
const DelayDistributionKindEntry = makeSelecetEntry(DELAY_TYPE, 'distributionKind', 'Delay distribution kind', DELAY_DISTRIBUTION_KIND_VALUES);

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

const GuardConditionTypeEntry = makeNestedConditionTextEntry(getGuardCondition, ensureGuardCondition, 'conditionType', 'Condition type (e.g. Attribute, Age, Gender)');
const GuardConditionAttributeEntry = makeNestedConditionTextEntry(getGuardCondition, ensureGuardCondition, 'attribute', 'Attribute name');
const GuardConditionOperatorEntry = makeNestedConditionTextEntry(getGuardCondition, ensureGuardCondition, 'operator', 'Operator (e.g. <=, ==, >)');
const GuardConditionValueEntry = makeNestedConditionTextEntry(getGuardCondition, ensureGuardCondition, 'value', 'Value');
const GuardConditionNegateEntry = makeNestedConditionCheckboxEntry(getGuardCondition, ensureGuardCondition, 'negate', 'Negate (Not)');

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
const EncounterReferenceEntry = makeTextEntry(ENCOUNTER_REFERENCE_TYPE, 'targetEncounter', 'Encounter reference');

// --- moddle helpers --------------------------------------------------------

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
