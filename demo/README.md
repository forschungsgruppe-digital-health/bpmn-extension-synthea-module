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
- your own diagrams — the modeler ships **no diagrams**. Open `.bpmn` or `.xml` files (BPMN XML), a whole folder or drop
  them on the page; the open files are listed on the left. Everything stays in the browser (the
  session is kept in `localStorage`, nothing is uploaded). A main pathway whose `CallSubmodule` states
  (`bpmn:callActivity`, `calledElement` = the submodule's process id) point to other files needs those
  files open as well: open the folder. The **Examples** menu opens the real files of `../lung-cancer/`
  (loaded on demand); the Quickstart of the site offers them for download as well.

So whatever you change in `extension/` is reflected here on the next reload.

`npm run demo:build` builds the static site (the same build the GitHub Pages workflow runs).

## Problems while you draw

Two checks run live, so a mistake shows while you model it, and they are shown apart:

- **Lint** (the same rules as `npm run lint:valid`, through `bpmn-js-bpmnlint`): an icon on the
  element and the count at the bottom of the canvas. This includes the converter's own checks, run
  before the conversion (rule `converter-errors`), and the checks of the values in the fields (time
  units, operators, ranges, code shapes). The rules are bundled for the browser from `.bpmnlintrc`
  by `tools/pack-lint-config.mjs`, which `npm run dev` and `build` run first; after changing a rule,
  restart the dev server.
- **Converter** (`src/live-check.js`): half a second after each change the open diagram is converted
  in the background. A problem gets a dashed outline and a **C** badge on the element (the message
  on hover), and the toolbar shows the count; a click opens the Messages tab with an explanation of
  each code. Unlike the lint this is the plain conversion together with the example pathways, so it
  also sees a missing sub-module.

Red is an error, orange a warning. The decision is still the one from `npm run validate`.

The two slots are the whole mental model: **`moddleExtensions` is the data layer**
(parse/serialise — required, or your `synthea:` data is dropped on save) and
**`additionalModules` is the UI layer** (the editing controls — optional). See
[`../docs/concepts.md`](../docs/concepts.md).

> The sample panel covers the `synthea:` types (`ProbabilityConfig`,
> `ConditionConfig`/`Condition`, `StateTypeConfig`, `DelayConfig`, `GuardConfig`,
> `SubmoduleConfig`, `EncounterContext`, `EncounterReference`, `CounterConfig`,
> `SetAttributeConfig`, `AssignToAttributeConfig`, `ReferencedByAttributeConfig`) — see
> `SyntheaPropertiesProvider.js` for which BPMN element each group appears on.

## Run it

From the repo root (deps are installed once via the workspace):

```bash
npm install        # installs this demo too (it is an npm workspace)
npm run demo       # vite dev server → http://localhost:5173/modeler/
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
