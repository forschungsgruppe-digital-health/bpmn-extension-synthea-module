module.exports = {
  configs: {
    all: {
      rules: {
        'synthea/probability-sum-valid': 'error',
        'synthea/negate-requires-condition': 'error',
        'synthea/state-type-fhirmap-consistent': 'warn'
      }
    }
  },
  rules: {
    'probability-sum-valid': './rules/probability-sum-valid',
    'negate-requires-condition': './rules/negate-requires-condition',
    'state-type-fhirmap-consistent': './rules/state-type-fhirmap-consistent'
  }
};
