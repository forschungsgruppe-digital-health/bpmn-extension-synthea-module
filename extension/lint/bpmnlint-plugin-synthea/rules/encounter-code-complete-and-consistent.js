const { is, getExtension } = require('../lib/utils');

/**
 * SYN-28 — the code of an encounter is complete and the same across its group.
 *
 * Synthea requires `codes` on every non-wellness Encounter, and a code is always
 * system + code + display (Basics wiki). synthea:EncounterContext carries it as
 * encounterCodeSystem / encounterCode / encounterCodeDisplay. Like wellness and
 * encounterClass it describes the encounter as a whole, so every member of the
 * same encounterId group must agree, and the three parts come together or not at
 * all. Process-level scope, like the other encounter-group rules.
 */
const FIELDS = ['encounterCodeSystem', 'encounterCode', 'encounterCodeDisplay'];

module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'bpmn:Process')) {
      return;
    }

    const groups = {};

    (node.flowElements || []).forEach((element) => {
      const context = getExtension(element, 'synthea:EncounterContext');

      if (!context || !context.encounterId) {
        return;
      }

      const code = FIELDS.map((f) => context[f] || '');

      groups[context.encounterId] = groups[context.encounterId] || [];
      groups[context.encounterId].push({ elementId: element.id, code });
    });

    Object.keys(groups).forEach((encounterId) => {
      const members = groups[encounterId];

      const incomplete = members.find((m) => m.code.some(Boolean) && !m.code.every(Boolean));

      if (incomplete) {
        reporter.report(
          incomplete.elementId,
          `Encounter group "${encounterId}": encounterCodeSystem, encounterCode and encounterCodeDisplay must be set together (Synthea needs system, code and display).`
        );
        return;
      }

      const distinct = new Set(members.map((m) => m.code.join('|')));

      if (distinct.size > 1) {
        reporter.report(
          members[0].elementId,
          `Encounter group "${encounterId}" has different encounter codes on its members — every state in the same encounter must agree.`
        );
      }
    });
  }

  return { check };
};
