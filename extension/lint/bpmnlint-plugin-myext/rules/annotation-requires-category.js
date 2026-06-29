const { is } = require('bpmnlint-utils');

/**
 * Every myext:Annotation must carry a non-empty "category" attribute.
 *
 * This is the kind of semantic constraint the BPMN20.xsd cannot express,
 * because custom extension elements are parsed with processContents="lax".
 */
module.exports = function () {
  function check(node, reporter) {
    const extensionElements = node.extensionElements;

    if (!extensionElements || !extensionElements.values) {
      return;
    }

    extensionElements.values.forEach(function (value) {
      if (is(value, 'myext:Annotation') && !value.category) {
        reporter.report(node.id, 'myext:Annotation is missing a "category" attribute');
      }
    });
  }

  return { check };
};
