/**
 * Default: every start event gets the state type `Initial`, so nobody has to choose it. The
 * converter infers it anyway (tools/bpmn2gmf/resolve.mjs); writing it into the diagram makes it
 * visible in the properties panel and in the file. It is set when a start event is created, dropped
 * from the palette, or made out of another element with the replace menu (for example a message
 * start event, whose `bpmn:` event definition then stays). A start event the user already gave a
 * state type is left alone.
 */
import CommandInterceptor from 'diagram-js/lib/command/CommandInterceptor.js';
import { is, getBusinessObject } from 'bpmn-js/lib/util/ModelUtil.js';

const STATE_TYPE = 'synthea:StateTypeConfig';

/**
 * Gives a start event the state type `Initial`, unless it already names one.
 *
 * @param {object} shape a diagram-js shape
 * @param {object} bpmnFactory the bpmn-js factory that creates moddle elements
 * @param {object} modeling the bpmn-js modeling service
 * @returns {boolean} true when the state type was set
 */
export function ensureInitial(shape, bpmnFactory, modeling) {
  if (!shape || !is(shape, 'bpmn:StartEvent')) return false;

  const businessObject = getBusinessObject(shape);
  let extensionElements = businessObject.get('extensionElements');
  if (!extensionElements) {
    extensionElements = bpmnFactory.create('bpmn:ExtensionElements', { values: [] });
    extensionElements.$parent = businessObject;
    modeling.updateProperties(shape, { extensionElements });
  }

  const values = extensionElements.get('values') || [];
  const existing = values.find((v) => is(v, STATE_TYPE));
  if (existing?.get('stateType')) return false;

  if (existing) {
    modeling.updateModdleProperties(shape, existing, { stateType: 'Initial' });
  } else {
    const config = bpmnFactory.create(STATE_TYPE, { stateType: 'Initial' });
    config.$parent = extensionElements;
    modeling.updateModdleProperties(shape, extensionElements, { values: [...values, config] });
  }
  return true;
}

/**
 * Registers the default on the command stack: after a start event is created or replaced.
 *
 * @param {import('diagram-js/lib/core/EventBus').default} eventBus the bpmn-js event bus (injected)
 * @param {object} bpmnFactory the bpmn-js factory (injected)
 * @param {object} modeling the bpmn-js modeling service (injected)
 */
export default function SyntheaStartEventDefaults(eventBus, bpmnFactory, modeling) {
  CommandInterceptor.call(this, eventBus);

  this.postExecuted('shape.create', (context) => ensureInitial(context.shape, bpmnFactory, modeling), true);
  this.postExecuted('shape.replace', (context) => ensureInitial(context.newShape, bpmnFactory, modeling), true);
}

SyntheaStartEventDefaults.$inject = ['eventBus', 'bpmnFactory', 'modeling'];
SyntheaStartEventDefaults.prototype = Object.create(CommandInterceptor.prototype);
SyntheaStartEventDefaults.prototype.constructor = SyntheaStartEventDefaults;
