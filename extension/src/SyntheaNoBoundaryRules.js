import { is } from 'bpmn-js/lib/util/ModelUtil';
import { isExpanded } from 'bpmn-js/lib/util/DiUtil';

// Dropping (or moving) an intermediate event onto a task would attach it there as a boundary event,
// and the converter rejects every boundary event (BOUNDARY_EVENT_UNSUPPORTED). The rule makes that
// drop impossible. An expanded sub-process still takes the event as content, and a boundary event
// that is already in an imported diagram can still be moved (the converter reports it).
const ACTIONS = ['shape.attach', 'shape.create', 'elements.create', 'elements.move'];
const HIGH_PRIORITY = 2000;

const isEvent = (shape) => is(shape, 'bpmn:IntermediateCatchEvent') || is(shape, 'bpmn:IntermediateThrowEvent');
const isHost = (target) => !!target && is(target, 'bpmn:Activity') && !(is(target, 'bpmn:SubProcess') && isExpanded(target));

function shapesOf(context) {
  return context.shapes || context.elements || (context.shape ? [context.shape] : []);
}

export default function SyntheaNoBoundaryRules(eventBus) {
  ACTIONS.forEach((action) => {
    eventBus.on(`commandStack.${action}.canExecute`, HIGH_PRIORITY, function (event) {
      const context = event.context;
      if (isHost(context.target) && shapesOf(context).some(isEvent)) {
        return false;
      }
    });
  });
}

SyntheaNoBoundaryRules.$inject = ['eventBus'];
