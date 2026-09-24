const { is, getExtension } = require('../lib/utils');

/**
 * SYN-25 — encounterClass must be consistent within an encounter group,
 * and set for non-wellness encounters.
 *
 * encounterClass mirrors Synthea's Encounter.encounter_class
 * (ambulatory/emergency/urgentcare/inpatient/outpatient/wellness) —
 * required on the real Encounter state for every non-wellness encounter.
 * Like wellness itself, it describes the encounter as a whole, not an
 * individual member state, so every state in the same encounterId group
 * must agree on it. Mirrors wellness-consistent-within-encounter's
 * structure and process-level scope.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'bpmn:Process')) {
      return;
    }

    const groups = collectEncounterGroups(node);

    Object.keys(groups).forEach((encounterId) => {
      const members = groups[encounterId];
      const distinctClasses = new Set(members.map((m) => m.encounterClass || '(unset)'));

      if (distinctClasses.size > 1) {
        reporter.report(
          members[0].elementId,
          `Encounter group "${encounterId}" has inconsistent synthea:EncounterContext.encounterClass values (` +
          members.map((m) => `${m.elementId}=${m.encounterClass || '(unset)'}`).join(', ') +
          ') — every state in the same encounter must agree on its encounter class.'
        );
        return;
      }

      const isWellness = members.every((m) => m.wellness);
      const hasClass = members.some((m) => m.encounterClass);

      if (!isWellness && !hasClass) {
        reporter.report(
          members[0].elementId,
          `Encounter group "${encounterId}" is not a wellness encounter but no member sets synthea:EncounterContext.encounterClass — encounter_class is required for non-wellness encounters in Synthea.`
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
      groups[id].push({
        elementId: element.id,
        wellness: !!context.wellness,
        encounterClass: context.encounterClass || null
      });
    });

    return groups;
  }

  return { check };
};
