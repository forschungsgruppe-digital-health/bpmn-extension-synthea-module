# Modeling playground (demo)

An interactive [bpmn-js](https://bpmn.io) modeler for **trying your extension by
hand** — open a diagram, select the task, edit the `Annotation (myext)` group in
the properties panel, and download the resulting XML to see your custom data.

This is a **private, non-published** workspace (it is not in the npm package's
`files`). It exists to demonstrate and manually test the extension; the
deterministic checks in the repo root (`npm run validate`, `npm run xsd:ext`)
remain the source of truth for pass/fail.

## What it wires up

It instantiates a bpmn-js `Modeler` with the **real** repo artifacts — no copies:

- `moddleExtensions: { myext: <descriptor> }` — `../extension/model/myExtension.json`
- `additionalModules: [ …, myExtModule ]` — `../extension/src/index.js` (the sample properties-panel provider)
- seed diagram — `../examples/valid/minimal-valid.bpmn` (imported via `?raw`)

So whatever you change in `extension/` is reflected here on the next reload.

The two slots are the whole mental model: **`moddleExtensions` is the data layer**
(parse/serialise — required, or your `myext:` data is dropped on save) and
**`additionalModules` is the UI layer** (the editing controls — optional). See
[`../docs/concepts.md`](../docs/concepts.md).

> The sample panel edits `category` and `reviewed` only. The descriptor's `note`
> child is present in the seed XML as a richer example but has no panel entry yet
> — adding one is a good first exercise.

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
