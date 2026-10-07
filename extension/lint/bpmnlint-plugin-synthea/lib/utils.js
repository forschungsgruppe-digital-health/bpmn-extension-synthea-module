const { is, isAny } = require('bpmnlint-utils');

/**
 * Find a synthea: extension element of the given type on a moddle node.
 *
 * @param {ModdleElement} node
 * @param {String} type e.g. 'synthea:ProbabilityConfig'
 * @return {ModdleElement|null}
 */
function getExtension(node, type) {
  const extensionElements = node.extensionElements;

  if (!extensionElements) {
    return null;
  }

  const values = extensionElements.values || [];

  return values.find((v) => is(v, type)) || null;
}

/**
 * @param {ModdleElement} node
 * @return {String|null}
 */
function getStateType(node) {
  const config = getExtension(node, 'synthea:StateTypeConfig');

  return config ? config.stateType || null : null;
}

/**
 * Best-effort read of fhirmap:resourceType. The fhirmap: package isn't
 * part of this setup's moddleExtensions, so we can't rely on is()
 * recognizing fhirmap: typed elements — same caveat as in the full
 * bpmnlint-plugin-synthea. See that package's lib/utils.js for the full
 * explanation of why this reads mapping.resourceType directly rather than
 * mapping.$attrs.resourceType.
 *
 * @param {ModdleElement} node
 * @return {String|null}
 */
function getFhirmapResourceType(node) {
  const extensionElements = node.extensionElements;

  if (!extensionElements) {
    return null;
  }

  const values = extensionElements.values || [];
  const mapping = findResourceMapping(values);

  if (!mapping) {
    return null;
  }

  return mapping.resourceType || (mapping.$attrs && mapping.$attrs.resourceType) || null;
}

/**
 * The fhirmap:resourceMapping of an extensionElements list, in either form:
 *   <fhirmap:resourceMapping .../>                                  (flat, used by the fixtures)
 *   <fhirmap:resourceMappings><fhirmap:resourceMapping .../>…       (the fhir-mapping package's form)
 * Matched by local name, since fhirmap: is not registered here (generic elements
 * keep their children in $children).
 */
function findResourceMapping(values) {
  const localName = (el) => String((el && el.$type) || '').split(':').pop();

  for (const v of values) {
    if (localName(v) === 'resourceMapping') {
      return v;
    }

    if (localName(v) === 'resourceMappings') {
      const child = (v.$children || v.mappings || []).find((c) => localName(c) === 'resourceMapping');

      if (child) {
        return child;
      }
    }
  }

  return null;
}

module.exports = {
  is,
  isAny,
  getExtension,
  getStateType,
  getFhirmapResourceType
};
