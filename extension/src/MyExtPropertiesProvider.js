import { is, getBusinessObject } from 'bpmn-js/lib/util/ModelUtil';
import {
  TextFieldEntry,
  isTextFieldEntryEdited,
  CheckboxEntry
} from '@bpmn-io/properties-panel';
import { useService } from 'bpmn-js-properties-panel';

const LOW_PRIORITY = 500;
const ANNOTATION_TYPE = 'myext:Annotation';

/**
 * Adds an "Annotation (myext)" group to the properties panel for every flow
 * node, letting you author the <myext:annotation> data interactively — the
 * same data the moddle descriptor defines and the bpmnlint rule checks.
 *
 * This mirrors the canonical bpmn-io properties-panel-extension pattern:
 * https://github.com/bpmn-io/bpmn-js-examples/tree/main/properties-panel-extension
 */
export default function MyExtPropertiesProvider(propertiesPanel, injector) {
  this.getGroups = function (element) {
    return function (groups) {
      if (is(element, 'bpmn:FlowNode')) {
        groups.push(createAnnotationGroup(element, injector));
      }
      return groups;
    };
  };

  propertiesPanel.registerProvider(LOW_PRIORITY, this);
}

MyExtPropertiesProvider.$inject = ['propertiesPanel', 'injector'];

function createAnnotationGroup(element) {
  return {
    id: 'myext-annotation',
    label: 'Annotation (myext)',
    entries: [
      { id: 'myext-category', element, component: CategoryEntry, isEdited: isTextFieldEntryEdited },
      { id: 'myext-reviewed', element, component: ReviewedEntry }
    ]
  };
}

function CategoryEntry(props) {
  const { element, id } = props;
  const modeling = useService('modeling');
  const bpmnFactory = useService('bpmnFactory');
  const translate = useService('translate');
  const debounce = useService('debounceInput');

  const getValue = () => {
    const annotation = getAnnotation(element);
    return annotation ? annotation.get('category') || '' : '';
  };

  const setValue = (value) => {
    const annotation = ensureAnnotation(element, bpmnFactory, modeling);
    modeling.updateModdleProperties(element, annotation, { category: value });
  };

  return TextFieldEntry({
    element,
    id,
    label: translate('Category'),
    getValue,
    setValue,
    debounce
  });
}

function ReviewedEntry(props) {
  const { element, id } = props;
  const modeling = useService('modeling');
  const bpmnFactory = useService('bpmnFactory');
  const translate = useService('translate');

  const getValue = () => {
    const annotation = getAnnotation(element);
    return annotation ? !!annotation.get('reviewed') : false;
  };

  const setValue = (value) => {
    const annotation = ensureAnnotation(element, bpmnFactory, modeling);
    modeling.updateModdleProperties(element, annotation, { reviewed: !!value });
  };

  return CheckboxEntry({
    element,
    id,
    label: translate('Reviewed'),
    getValue,
    setValue
  });
}

// --- moddle helpers ------------------------------------------------------

function getAnnotation(element) {
  const extensionElements = getBusinessObject(element).get('extensionElements');
  if (!extensionElements) {
    return null;
  }
  return (extensionElements.get('values') || []).find((v) => is(v, ANNOTATION_TYPE)) || null;
}

function ensureAnnotation(element, bpmnFactory, modeling) {
  const businessObject = getBusinessObject(element);

  let extensionElements = businessObject.get('extensionElements');
  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = businessObject;
    modeling.updateProperties(element, { extensionElements });
  }

  let annotation = (extensionElements.get('values') || []).find((v) => is(v, ANNOTATION_TYPE));
  if (!annotation) {
    annotation = bpmnFactory.create(ANNOTATION_TYPE, { reviewed: false });
    annotation.$parent = extensionElements;
    modeling.updateModdleProperties(element, extensionElements, {
      values: [...(extensionElements.get('values') || []), annotation]
    });
  }

  return annotation;
}
