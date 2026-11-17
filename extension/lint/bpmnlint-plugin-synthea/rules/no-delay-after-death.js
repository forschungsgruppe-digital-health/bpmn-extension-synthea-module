const { is, getExtension, getStateType } = require('../lib/utils');

/**
 * SYN-42 — no-delay-after-death.
 *
 * A Delay or a Guard after a Death state. The wiki says a Death with a time (a range or an exact
 * value) schedules the death in the future and the module carries on in the same time step, and
 * warns that a Death followed by a Delay can produce records with a time stamp after the death.
 * So the patient's record shows things happening to someone who is already dead.
 *
 * A warning, because it is not an error in the module: it is easy to draw without meaning it, and
 * the fix is to put the Death last (it is usually an end event leading to the Terminal state).
 * The check follows the sequence flows of one process or sub-process.
 */
module.exports = function() {

  function isWait(node) {
    const type = getStateType(node);

    return type === 'Delay' || type === 'Guard' || !!getExtension(node, 'synthea:DelayConfig') || !!getExtension(node, 'synthea:GuardConfig');
  }

  function check(node, reporter) {

    if (!is(node, 'bpmn:Process') && !is(node, 'bpmn:SubProcess')) {
      return;
    }

    const elements = node.flowElements || [];
    const outgoing = new Map();

    for (const el of elements) {
      if (is(el, 'bpmn:SequenceFlow') && el.sourceRef && el.targetRef) {
        outgoing.set(el.sourceRef.id, [ ...(outgoing.get(el.sourceRef.id) || []), el.targetRef ]);
      }
    }

    for (const death of elements.filter((el) => getStateType(el) === 'Death')) {
      const seen = new Set([ death.id ]);
      const queue = [ ...(outgoing.get(death.id) || []) ];

      while (queue.length) {
        const next = queue.shift();

        if (seen.has(next.id)) {
          continue;
        }
        seen.add(next.id);

        if (isWait(next)) {
          reporter.report(
            death.id,
            `${next.name ? `"${next.name}"` : next.id} waits after this Death state. Synthea carries on after a death in the same time step, so a delay or guard behind it can give records with a time stamp after the death. End the pathway at the Death.`
          );
          break;
        }
        queue.push(...(outgoing.get(next.id) || []));
      }
    }
  }

  return { check };
};
