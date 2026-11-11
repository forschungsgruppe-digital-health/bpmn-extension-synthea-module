const { is, getExtension } = require('../lib/utils');

/**
 * SYN-34 — unique-element-names.
 *
 * Every named task, event, gateway, call activity and sub-process becomes one Synthea
 * state, and Synthea identifies states by name: a transition names its target. The state name
 * is the BPMN label verbatim (docs/implicit-rules.md), so two elements with the same label in
 * one process would collide. The converter then renames the later one by appending its element id
 * (note STATE_NAME_DUPLICATE), and the generated module no longer matches the diagram.
 *
 * Checked per container (process or sub-process; a sub-process becomes a module of its own, so
 * the same label may appear in a different module). Not counted: unnamed elements (they get an
 * id-based name), start events (the state is always called "Initial"), link events (a throw and
 * its catch share one name on purpose), and elements marked synthea:documentationOnly (no state).
 * No element other than the start event may be called "Initial".
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'bpmn:Process') && !is(node, 'bpmn:SubProcess')) {
      return;
    }

    const seen = new Map();

    if ((node.flowElements || []).some((el) => is(el, 'bpmn:StartEvent'))) {
      seen.set('Initial', 'the start event');
    }

    for (const el of node.flowElements || []) {

      if (!becomesState(el)) {
        continue;
      }

      const name = (el.name || '').trim();

      if (!name) {
        continue;
      }

      if (seen.has(name)) {
        reporter.report(
          el.id,
          'Name "' + name + '" is already used by ' + seen.get(name) + ' in this ' +
          (is(node, 'bpmn:Process') ? 'process' : 'sub-process') + '. Synthea identifies states by name, ' +
          'so each element needs its own name.'
        );
      } else {
        seen.set(name, el.id);
      }
    }
  }

  function becomesState(el) {

    if (is(el, 'bpmn:SequenceFlow') || is(el, 'bpmn:StartEvent') || !is(el, 'bpmn:FlowNode')) {
      return false;
    }

    if (is(el, 'bpmn:Event') && (el.eventDefinitions || []).some((d) => is(d, 'bpmn:LinkEventDefinition'))) {
      return false;
    }

    return !getExtension(el, 'synthea:DocumentationOnly');
  }

  return { check };
};
