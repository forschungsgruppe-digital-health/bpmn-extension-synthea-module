# Consumer example

A minimal project that uses the extension as a file-based dependency
(`"bpmn-js-synthea-extension": "file:../.."` in `package.json`).

```bash
npm install
npm run build      # bundles the modeler with the extension
npm run dev        # starts it on http://localhost:5173
npm run convert    # runs the converter (bin: bpmn2gmf) on diagram.bpmn
```

`src/main.js` shows what a project has to do: add the module (next to the
properties panel modules, which the extension needs) to
`additionalModules` and register the moddle extension under the `synthea` prefix.
