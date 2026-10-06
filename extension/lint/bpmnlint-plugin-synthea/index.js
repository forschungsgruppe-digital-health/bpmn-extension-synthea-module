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
        'synthea/delay-requires-shape': 'error',
        'synthea/encounter-reference-requires-condition-or-allergy-context': 'warn',
        'synthea/wellness-consistent-within-encounter': 'error',
        'synthea/counter-requires-action': 'error',
        'synthea/set-attribute-requires-attribute': 'error',
        'synthea/assign-to-attribute-requires-valid-state': 'warn',
        'synthea/delay-range-requires-high-value': 'error',
        'synthea/referenced-by-attribute-requires-valid-state': 'warn',
        'synthea/referenced-by-attribute-matches-assign': 'warn',
        'synthea/encounter-class-consistent-within-encounter': 'warn',
        'synthea/attribute-name-lower-snake-case': 'warn',
        'synthea/gateway-branches-require-condition-or-probability': 'warn',
        'synthea/encounter-code-complete-and-consistent': 'warn',
        'synthea/value-range-requires-high-value': 'warn',
        'synthea/careplan-activity-requires-code-and-display': 'warn'
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
    'delay-requires-shape': './rules/delay-requires-shape',
    'encounter-reference-requires-condition-or-allergy-context': './rules/encounter-reference-requires-condition-or-allergy-context',
    'wellness-consistent-within-encounter': './rules/wellness-consistent-within-encounter',
    'counter-requires-action': './rules/counter-requires-action',
    'set-attribute-requires-attribute': './rules/set-attribute-requires-attribute',
    'assign-to-attribute-requires-valid-state': './rules/assign-to-attribute-requires-valid-state',
    'delay-range-requires-high-value': './rules/delay-range-requires-high-value',
    'referenced-by-attribute-requires-valid-state': './rules/referenced-by-attribute-requires-valid-state',
    'referenced-by-attribute-matches-assign': './rules/referenced-by-attribute-matches-assign',
    'encounter-class-consistent-within-encounter': './rules/encounter-class-consistent-within-encounter',
    'attribute-name-lower-snake-case': './rules/attribute-name-lower-snake-case',
    'gateway-branches-require-condition-or-probability': './rules/gateway-branches-require-condition-or-probability',
    'encounter-code-complete-and-consistent': './rules/encounter-code-complete-and-consistent',
    'value-range-requires-high-value': './rules/value-range-requires-high-value',
    'careplan-activity-requires-code-and-display': './rules/careplan-activity-requires-code-and-display'
  }
};
