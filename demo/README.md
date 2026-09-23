# Modeling playground (demo)

An interactive [bpmn-js](https://bpmn.io) modeler for **trying your extension by
hand** — open a diagram, select an element, edit its `synthea:` properties
groups (e.g. `State type`, `Encounter Context`), and download the resulting
XML to see your custom data.

This is a **private, non-published** workspace (it is not in the npm package's
`files`). It exists to demonstrate and manually test the extension; the
deterministic checks in the repo root (`npm run validate`, `npm run xsd:ext`)
remain the source of truth for pass/fail.

## What it wires up

It instantiates a bpmn-js `Modeler` with the **real** repo artifacts — no copies:

- `moddleExtensions: { synthea: <descriptor> }` — `../extension/model/synthea.json`
- `additionalModules: [ …, syntheaModule ]` — `../extension/src/index.js` (the sample properties-panel provider)
- pathways — all five real `../lung-cancer/*.bpmn` files (imported via `?raw`), switchable via the
  **Pathway** dropdown in the toolbar: the main `synthea-lung-cancer.bpmn` module plus its four
  submodules (`lung-cancer-probabilities-submodule.bpmn`, `lung-cancer-treatment-submodule.bpmn`,
  `symptom-check-submodule.bpmn`, `anemia-submodule.bpmn`). The main module's four `CallSubmodule`
  states are drawn as small placeholder sub-processes on the canvas — their actual content lives in
  these separate files, not inline.

So whatever you change in `extension/` is reflected here on the next reload.

The two slots are the whole mental model: **`moddleExtensions` is the data layer**
(parse/serialise — required, or your `synthea:` data is dropped on save) and
**`additionalModules` is the UI layer** (the editing controls — optional). See
[`../docs/concepts.md`](../docs/concepts.md).

> The sample panel covers all twelve `synthea:` types (`ProbabilityConfig`,
> `ConditionConfig`/`Condition`, `StateTypeConfig`, `DelayConfig`, `GuardConfig`,
> `SubmoduleConfig`, `EncounterContext`, `EncounterReference`, `CounterConfig`,
> `SetAttributeConfig`, `AssignToAttributeConfig`) — see
> `SyntheaPropertiesProvider.js` for which BPMN element each group appears on.

## Run it

From the repo root (deps are installed once via the workspace):

```bash
npm install        # installs this demo too (it is an npm workspace)
npm run demo       # vite dev server → http://localhost:5173
```

Or from here: `npm run dev` / `npm run build` / `npm run preview`.

## Where it can run

- **Locally** — `npm run demo`.
- **Dev container / GitHub Codespaces** — `.devcontainer/` installs everything
  and auto-starts this server on a forwarded port (zero local setup). The preview
  opens on port 5173 once `npm install` finishes; on a cold first boot it may be
  briefly unavailable while dependencies install.
- **GitHub Pages** — `.github/workflows/pages.yml` builds this app
  (`vite build`) and publishes it as a static site. Enable it under
  **Settings → Pages → Source: GitHub Actions**.

> Static hosting is enough because bpmn-js runs entirely in the browser. The
> published bundle is public, so keep only abstract/synthetic diagrams here —
> never real data.
