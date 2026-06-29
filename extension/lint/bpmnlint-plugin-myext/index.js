// bpmnlint plugin entry point.
// Rule implementations are resolved by convention from ./rules/<name>.js
module.exports = {
  configs: {
    recommended: {
      rules: {
        'annotation-requires-category': 'error'
      }
    }
  }
};
