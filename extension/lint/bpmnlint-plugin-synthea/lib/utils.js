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

module.exports = {
  is,
  isAny,
  getExtension,
  getStateType
};
