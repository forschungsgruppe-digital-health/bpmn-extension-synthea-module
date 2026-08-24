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
  const mapping = values.find((v) => v.$type === 'fhirmap:resourceMapping');

  if (!mapping) {
    return null;
  }

  return mapping.resourceType || (mapping.$attrs && mapping.$attrs.resourceType) || null;
}

module.exports = {
  is,
  isAny,
  getExtension,
  getStateType,
  getFhirmapResourceType
};
