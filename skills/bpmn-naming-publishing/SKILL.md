---
name: bpmn-naming-publishing
description: Check npm packaging and naming conventions before publishing a bpmn.io extension. Use when preparing a release, editing package.json, or publishing to npm.
---

# Naming & publishing conventions

Run `npm run conventions`, then confirm:

- Package name starts with `bpmn-js-` (modules) or `bpmnlint-plugin-` (lint plugins); scoped names like `@org/bpmn-js-foo` are fine.
- `bpmn-js` / `diagram-js` are declared as `peerDependencies`, not `dependencies`.
- `license` is set and `type` is `module` (ship ES modules).
- Publishing runs inside `.github/workflows/release-please.yml` when the Release
  Please PR is merged — **not** on a tag push (a tag pushed by `GITHUB_TOKEN`
  starts no second workflow). An `NPM_TOKEN` repository secret must be set.

Report violations with the exact field to change.
Do not bump versions or publish unless asked.
