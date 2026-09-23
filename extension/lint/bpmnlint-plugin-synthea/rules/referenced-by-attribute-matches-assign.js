const { is, getExtension } = require('../lib/utils');

/**
 * SYN-24 — referencedByAttributeConfig should reference an attribute that
 * was actually assigned via assignToAttributeConfig somewhere in the same
 * process.
 *
 * AssignToAttributeConfig/ReferencedByAttributeConfig link a later *End/
 * Death state back to the *Onset/Order/Start state it concerns purely by
 * sharing the same attribute name (see docs/implicit-rules.md, Section A)
 * — there is no ID-based connection between them. Nothing enforced that
 * the two names actually match, so a typo on either side silently broke
 * the reference: lint-clean, but unresolvable for Synthea at runtime.
 * This only checks presence within the same process (matching this
 * extension's existing scope, e.g. wellness-consistent-within-encounter)
 * — it does not verify that the assign happens earlier in flow order,
 * since that would need full graph traversal.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'bpmn:Process')) {
      return;
    }

    const assignedAttributes = collectAssignedAttributes(node);

    (node.flowElements || []).forEach((element) => {
      const referencedByConfig = getExtension(element, 'synthea:ReferencedByAttributeConfig');

      if (!referencedByConfig || !referencedByConfig.attribute) {
        return;
      }

      if (!assignedAttributes.has(referencedByConfig.attribute)) {
        reporter.report(
          element.id,
          `referencedByAttributeConfig references attribute "${referencedByConfig.attribute}" but no assignToAttributeConfig with that name was found in this process — the reference is unresolvable.`
        );
      }
    });
  }

  function collectAssignedAttributes(process) {
    const attributes = new Set();

    (process.flowElements || []).forEach((element) => {
      const assignConfig = getExtension(element, 'synthea:AssignToAttributeConfig');

      if (assignConfig && assignConfig.attribute) {
        attributes.add(assignConfig.attribute);
      }
    });

    return attributes;
  }

  return { check };
};
