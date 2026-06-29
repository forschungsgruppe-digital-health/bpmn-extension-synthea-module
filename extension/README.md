# Your custom BPMN extension

Author your extension here. The parts:

- `model/` — the moddle descriptor (JSON) that defines the data your extension
  persists into the BPMN XML. This is the **required** core and the single
  source of truth. (`model/*.xsd` is *generated* from it by `npm run xsd:gen`
  for optional XSD-native validation — never hand-edit it.)
- `lint/bpmnlint-plugin-myext/` — custom bpmnlint rules that enforce the
  semantics of your extension data.
- `src/` — *optional* bpmn-js modules (custom renderer, palette entries,
  context-pad actions, modeling rules, properties-panel groups). These change
  the editor/viewer behaviour but are not needed for the data to be valid.
  Ships a sample: `index.js` (the `additionalModules` entry) +
  `MyExtPropertiesProvider.js` (a properties-panel group for editing the
  annotation). Try it live with the [`demo/`](../demo/) playground (`npm run demo`).
  Learn the pattern from the canonical bpmn.io examples:
  [custom-meta-model](https://github.com/bpmn-io/bpmn-js-examples/tree/main/custom-meta-model)
  (the descriptor) and
  [properties-panel-extension](https://github.com/bpmn-io/bpmn-js-examples/tree/main/properties-panel-extension)
  (this provider).

Rename `myext` / `myExtension` everywhere to your own prefix and name.
See the root `README.md` for the full anatomy and workflow.
