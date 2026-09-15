const { is, getExtension } = require('../lib/utils');

/**
 * SYN-19 (revised, ADR-0003) — wellness must be consistent within an
 * encounter group.
 *
 * Encounter/EncounterEnd are no longer drawn as explicit states (ADR-0003
 * supersedes ADR-0002's flow-node approach). Instead, every clinical state
 * belonging to an encounter carries synthea:EncounterContext with the same
 * encounterId, and tools/bpmn2gmf derives the encounter's span and
 * synthesizes the Encounter/EncounterEnd GMF states from it. `wellness`
 * moved onto EncounterContext itself (no more separate WellnessConfig) —
 * it describes the encounter as a whole, not an individual state, so every
 * member of the same encounterId group must agree on its value. This rule
 * checks that agreement per bpmn:Process, since encounterId only groups
 * states within one process/submodule.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'bpmn:Process')) {
      return;
    }

    const groups = collectEncounterGroups(node);

    Object.keys(groups).forEach((encounterId) => {
      const members = groups[encounterId];
      const distinctWellnessValues = new Set(members.map((m) => m.wellness));

      if (distinctWellnessValues.size > 1) {
        reporter.report(
          members[0].elementId,
          `Encounter group "${encounterId}" has inconsistent synthea:EncounterContext.wellness values (` +
          members.map((m) => `${m.elementId}=${m.wellness}`).join(', ') +
          ') — every state in the same encounter must agree on whether it is a wellness encounter.'
        );
      }
    });
  }

  function collectEncounterGroups(process) {
    const groups = {};

    (process.flowElements || []).forEach((element) => {
      const context = getExtension(element, 'synthea:EncounterContext');

      if (!context || !context.requiresEncounterContext || !context.encounterId) {
        return;
      }

      const id = context.encounterId;

      groups[id] = groups[id] || [];
      groups[id].push({ elementId: element.id, wellness: !!context.wellness });
    });

    return groups;
  }

  return { check };
};
