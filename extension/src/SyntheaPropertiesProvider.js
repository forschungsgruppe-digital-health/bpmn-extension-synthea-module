import { is, getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';
import {
  TextFieldEntry,
  isTextFieldEntryEdited,
  CheckboxEntry,
  SelectEntry
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';

const LOW_PRIORITY = 500;

// --- synthea: extension type names --------------------------------------
// Only the three types this reference package covers. See the full
// SyntheaPropertiesProvider.js for the complete extension.

const PROBABILITY_TYPE = 'synthea:ProbabilityConfig';
const CONDITION_CONFIG_TYPE = 'synthea:ConditionConfig';
const STATE_TYPE = 'synthea:StateTypeConfig';

// Mirrors the StateType enum in synthea.json — kept in sync by hand,
// since bpmn-moddle doesn't expose enum literals at runtime in a form
// convenient for a <select>.
const STATE_TYPE_VALUES = [
  'Initial', 'Terminal', 'Simple', 'Guard', 'Delay', 'SetAttribute', 'Counter',
  'CallSubmodule', 'Encounter', 'EncounterEnd', 'ConditionOnset', 'ConditionEnd',
  'AllergyOnset', 'AllergyEnd', 'MedicationOrder', 'MedicationEnd', 'CarePlanStart',
  'CarePlanEnd', 'Procedure', 'ImagingStudy', 'Device', 'DeviceEnd', 'SupplyList',
  'VitalSign', 'Observation', 'MultiObservation', 'DiagnosticReport', 'Symptom',
  'Death', 'Physiology'
];

/**
 * Properties panel provider — covers exactly three synthea: types:
 *  - "State type"   on End Events, Tasks, SubProcesses and Intermediate
 *                    Catch/Throw Events — the elements where the plain
 *                    BPMN type alone is ambiguous
 *  - "Probability"  on Sequence Flows — distributed_transition weights
 *  - "Condition"    on Sequence Flows — conditional_transition condition
 *                    (+ negate for Not)
 *
 * This is a deliberately reduced reference implementation for
 * documentation/demo purposes — it does not yet cover Delay, Guard,
 * Encounter context, Pair reference, Lookup table or Composite condition
 * (planned for the full extension).
 */
export default function SyntheaPropertiesProvider(propertiesPanel, injector) {
  this.getGroups = function (element) {
    return function (groups) {

      if (is(element, 'bpmn:EndEvent')) {
        groups.push(createStateTypeGroup(element));
      }

      if (is(element, 'bpmn:Task')) {
        groups.push(createStateTypeGroup(element));
      }

      if (is(element, 'bpmn:SubProcess') && !is(element, 'bpmn:CallActivity')) {
        groups.push(createStateTypeGroup(element));
      }

      if (is(element, 'bpmn:IntermediateCatchEvent') || is(element, 'bpmn:IntermediateThrowEvent')) {
        groups.push(createStateTypeGroup(element));
      }

      if (is(element, 'bpmn:SequenceFlow')) {
        groups.push(createProbabilityGroup(element));
        groups.push(createConditionGroup(element));
      }

      return groups;
    };
  };

  propertiesPanel.registerProvider(LOW_PRIORITY, this);
}

SyntheaPropertiesProvider.$inject = ['propertiesPanel', 'injector'];

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
