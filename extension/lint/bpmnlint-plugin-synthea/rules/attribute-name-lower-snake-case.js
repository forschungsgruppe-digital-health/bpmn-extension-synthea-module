const { is } = require('../lib/utils');

/**
 * SYN-26 — attribute names should be lower_snake_case.
 *
 * Synthea's Basics wiki page states attribute names follow lower_snake_case
 * and are shared across the whole simulation (unique across all modules, not
 * namespaced per module) — so a malformed name isn't just cosmetic, it also
 * makes accidental collisions with an unrelated attribute harder to spot.
 * This only checks format, not cross-file uniqueness: this project's real
 * files deliberately share attribute names between the main pathway and a
 * submodule (e.g. the main pathway sets an attribute a submodule reads),
 * which is the intended communication mechanism and not something a lint
 * rule should flag as a conflict.
 */

const LOWER_SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

// Attributes that Synthea itself defines (not ours to rename) and that don't
// follow the convention. Conditions read them, so the name has to match
// Synthea's exactly. Verified against upstream modules (lung_cancer_probabilities.json).
const SYNTHEA_BUILT_IN_ATTRIBUTES = new Set(['quit smoking age']);

const ATTRIBUTE_PROPERTIES_BY_TYPE = [
  { type: 'synthea:SetAttributeConfig', property: 'attribute' },
  { type: 'synthea:CounterConfig', property: 'attribute' },
  { type: 'synthea:Condition', property: 'attribute' },
  { type: 'synthea:ProbabilityConfig', property: 'probabilityAttribute' },
  { type: 'synthea:AssignToAttributeConfig', property: 'attribute' },
  { type: 'synthea:ReferencedByAttributeConfig', property: 'attribute' }
];

module.exports = function() {

  function check(node, reporter) {

    const match = ATTRIBUTE_PROPERTIES_BY_TYPE.find((entry) => is(node, entry.type));

    if (!match) {
      return;
    }

    const value = node[match.property];

    if (!value || LOWER_SNAKE_CASE.test(value) || SYNTHEA_BUILT_IN_ATTRIBUTES.has(value)) {
      return;
    }

    reporter.report(
      nearestReportableId(node),
      `${match.type}.${match.property} = "${value}" is not lower_snake_case — Synthea attribute names should match ${LOWER_SNAKE_CASE} (e.g. "lung_cancer_type", not "Lung Cancer Type").`
    );
  }

  function nearestReportableId(node) {
    let current = node.$parent;

    while (current && !current.id) {
      current = current.$parent;
    }

    return current ? current.id : undefined;
  }

  return { check };
};
