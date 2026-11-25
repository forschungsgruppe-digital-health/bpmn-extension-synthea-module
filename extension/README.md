# The `synthea:` extension

The BPMN extension for Synthea modules (prefix `synthea`) and the converter that turns the diagrams
into Synthea modules. The parts:

- `model/` — the moddle descriptor `synthea.json` that defines the data the extension persists into
  the BPMN XML. This is the core and the single source of truth. `synthea.values.json` holds the fixed
  value lists the Synthea wiki gives (time units, operators, gender, race). `synthea.xsd` is
  *generated* from both by `npm run xsd:gen`, for XSD-native validation of structure and fixed
  choices — never hand-edit it.
- `lint/bpmnlint-plugin-synthea/` — the bpmnlint rules that check the meaning of the `synthea:` data,
  including the converter's own checks before the conversion (SYN-36, SYN-37). See
  [`docs/lint-rules.md`](../docs/lint-rules.md).
- `src/` — the bpmn-js module (`index.js`, the `additionalModules` entry): the Synthea group of the
  properties panel (`SyntheaPropertiesProvider.js`, with `descriptions.js` and `fieldValidation.js`),
  the palette and replace menu filters, the `Initial` default of start events and the rule that
  forbids boundary events. Try it with the [`demo/`](../demo/) modeler (`npm run demo`).
- `src/converter/` — the converter from BPMN to Synthea modules (`convert.mjs`, exported as
  `bpmn-js-synthea-extension/converter`) and its command line `bpmn2gmf` (`cli.mjs`). See
  [`docs/converter-overview.md`](../docs/converter-overview.md).
- `test/` — the tests (`npm test`): converter, lint rules, properties panel, and the golden files of
  the lung cancer pathway in [`../examples/lung-cancer/`](../examples/lung-cancer/README.md).

The package ships `model/`, `src/` (with the converter) and this README; the lint plugin and the
tests stay in the repository. See the root [`README.md`](../README.md) for the whole workflow and
[`docs/extension-api.md`](../docs/extension-api.md) for using the extension in your own project.
