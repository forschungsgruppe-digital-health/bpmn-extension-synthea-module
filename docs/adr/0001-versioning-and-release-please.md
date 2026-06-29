# ADR-0001: One SemVer across all extension artifacts, namespace URI excluded

- **Status:** accepted
- **Date:** 2026-06-27
- **Deciders:** maintainers

## Context

Release Please owns the package version (root `package.json` + the manifest).
The extension's data, however, lives in several artifacts that should agree on a
single version so a consumer can tell which release a file came from:

- the published package (`package.json`),
- the lint plugin (`extension/lint/bpmnlint-plugin-myext/package.json`),
- the moddle descriptor (`extension/model/myExtension.json`),
- the generated XSD (`extension/model/myExtension.xsd`).

There is a trap: the moddle descriptor's namespace `uri`
(`http://example.com/schema/my-extension/1.0`) embeds a version, but that is the
**data-format contract** version. Auto-bumping it on every release would change
the XML namespace and break every diagram already in the wild (AGENTS.md lists
changing the `uri` under "ask first"). So the release SemVer and the namespace
contract version are two different things and must not be conflated.

## Decision

We keep **one SemVer** across the package, the lint plugin, the descriptor, and
the XSD, applied automatically by Release Please — and we leave the namespace
`uri` alone.

- The descriptor gains a `version` field (package SemVer, not the namespace).
- `tools/moddle-to-xsd.mjs` stamps `descriptor.version` into the generated XSD on
  a line annotated with `x-release-please-version`, so the XSD version always
  derives from the descriptor (and the drift guard `xsd:gen:check` ties them
  together).
- `release-please-config.json` lists `extra-files` so one release bumps, in
  lockstep: the lint-plugin `package.json` (json updater), the descriptor's
  `version` (json updater), and the XSD line (generic updater) — alongside the
  root `package.json` it already owned.
- The namespace `uri` is changed **by hand only**, as a deliberate breaking
  change to the data format (a new ADR when that happens).

## Consequences

- A reader of any artifact sees the same version; CI's drift guard fails loudly
  if the XSD and descriptor ever disagree, so a misconfigured updater cannot ship
  a silent inconsistency.
- The namespace stays stable across ordinary releases — diagrams keep parsing.
- Cost: the descriptor carries a `version` field that moddle ignores, and the XSD
  carries a version comment. Both verified harmless (round-trip is clean).

## Alternatives considered

- **An `xml` updater on a schema `version` attribute** — rejected: release-please
  attribute/namespace handling is less certain than the generic text updater, and
  a silent miss would leave the XSD stale. The annotated comment + drift guard is
  more robust.
- **Separate Release Please components with the `linked-versions` plugin** —
  rejected as heavier (multiple changelogs/tags) than this template needs; one
  component with `extra-files` keeps a single version, changelog, and tag.
