module.exports = {
  configs: {
    all: {
      rules: {
        'synthea/probability-sum-valid': 'error',
        'synthea/negate-requires-condition': 'error',
        'synthea/state-type-fhirmap-consistent': 'warn',
        'synthea/guard-state-requires-guard-config': 'error',
        'synthea/guard-allow-requires-condition': 'error',
        'synthea/callsubmodule-requires-submodule-config': 'error',
        'synthea/delay-distribution-kind-requires-distribution-shape': 'error',
        'synthea/delay-requires-shape': 'error',
        'synthea/encounter-reference-requires-condition-or-allergy-context': 'warn',
        'synthea/wellness-requires-encounter-state': 'error'
      }
    }
  },
  rules: {
    'probability-sum-valid': './rules/probability-sum-valid',
    'negate-requires-condition': './rules/negate-requires-condition',
    'state-type-fhirmap-consistent': './rules/state-type-fhirmap-consistent',
    'guard-state-requires-guard-config': './rules/guard-state-requires-guard-config',
    'guard-allow-requires-condition': './rules/guard-allow-requires-condition',
    'callsubmodule-requires-submodule-config': './rules/callsubmodule-requires-submodule-config',
    'delay-distribution-kind-requires-distribution-shape': './rules/delay-distribution-kind-requires-distribution-shape',
    'delay-requires-shape': './rules/delay-requires-shape',
    'encounter-reference-requires-condition-or-allergy-context': './rules/encounter-reference-requires-condition-or-allergy-context',
    'wellness-requires-encounter-state': './rules/wellness-requires-encounter-state'
  }
};
