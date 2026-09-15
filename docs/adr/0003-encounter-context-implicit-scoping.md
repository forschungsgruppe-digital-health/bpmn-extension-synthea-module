# ADR-0003: Encounter scope is derived from `EncounterContext`, not drawn explicitly

- **Status:** accepted
- **Date:** 2026-09-15
- **Deciders:** extension maintainers
- **Supersedes:** [ADR-0002](0002-encounter-as-flow-node.md) (the flow-node-vs-annotation part; see below for exactly what carries over)

## Context

ADR-0002 moved `Encounter`/`EncounterEnd` from `TextAnnotation` onto ordinary
flow nodes (Task/EndEvent/SubProcess) with `synthea:StateTypeConfig`, so that
`WellnessConfig` could sit on the same element instead of needing a
cross-element reference. That still requires the modeler to explicitly draw
two bracket states — an `Encounter` node and a matching `EncounterEnd` node —
for every encounter in a path.

Revisiting this: `synthea:EncounterContext` already exists to mark "this state
must occur inside an Encounter block" (currently a bare
`requiresEncounterContext` boolean, still sitting on `TextAnnotation`). If
every clinical state that belongs to a given encounter carries this marker
individually, the encounter's extent doesn't need to be drawn at all — it can
be *derived*: the encounter begins right before the first marked state (in
sequence-flow order) and ends right after the last one.

A single boolean isn't enough once a path can contain more than one, separate
encounter (e.g. a routine checkup earlier and an emergency visit later, with
unrelated states in between). Without a way to say which marked states belong
to the *same* encounter, a naive "first marked to last marked" span would
incorrectly merge two unrelated encounters — and everything between them —
into one. `EncounterContext` therefore needs a second attribute: an encounter
identifier, so states can be grouped per encounter instance before their span
is computed.

## Decision

We drop explicit `Encounter`/`EncounterEnd` states from the diagram entirely
and derive each encounter's scope from `synthea:EncounterContext` instead.

- `synthea:EncounterContext` gains two attributes alongside
  `requiresEncounterContext`: `encounterId` (String) — shared by every state
  belonging to the same encounter instance — and `wellness` (Boolean),
  which now lives here instead of a separate type.
- `synthea:WellnessConfig` is removed. Wellness describes the encounter as a
  whole, not an individual state, so it belongs on the same marker that
  identifies encounter membership, not on a state-specific config.
- Every clinical state inside an encounter carries `EncounterContext` with
  that identifier individually; there is no single "start" or "end" marker to
  draw.
- `tools/bpmn2gmf` groups marked states by identifier, takes each group's
  first-to-last span in sequence-flow order, and **synthesizes** the
  `Encounter` and `EncounterEnd` GMF states around that span in the generated
  JSON — they exist only in the output, not in the source BPMN diagram.
- `StateType.Encounter` / `StateType.EncounterEnd` are removed from the enum —
  no element is ever typed as one of these two states in the diagram anymore.
- The old `wellness-requires-encounter-state` rule (SYN-19, sibling
  `StateTypeConfig` check) is replaced by `wellness-consistent-within-encounter`:
  for every `encounterId` group in a process, all members must agree on
  `wellness` (a group can't be a wellness encounter according to one state and
  not another).

## Consequences

- Modelers no longer draw or place bracket states for an encounter, or worry
  about whether `Encounter` is a Task, EndEvent, or annotation (ADR-0002's
  open question about the diagram convention is moot for this path).
- Multiple, separate encounters in one path are representable without
  ambiguity, via the identifier grouping.
- **Resolved:** `WellnessConfig` is folded into `EncounterContext` as a
  `wellness` field, implemented in `extension/model/synthea.json`,
  `SyntheaPropertiesProvider.js`, and the `wellness-consistent-within-encounter`
  lint rule.
- The properties panel now offers the `EncounterContext` group (checkbox,
  encounter ID, wellness checkbox) on every state-bearing element
  (Task/EndEvent/SubProcess/IntermediateCatchEvent/IntermediateThrowEvent), not
  only `TextAnnotation` — required for the mechanism to be usable at all, since
  clinical states need to carry the marker directly.
- `docs/implicit-rules.md` Table B/B.1 updated to drop `Encounter`/`EncounterEnd`
  as annotation-disambiguated states and describe the `EncounterContext`-based
  grouping instead.
- ADR-0002's core insight (same-element checks are more robust than
  cross-element/annotation lookups) still applies — it now applies to the
  `EncounterContext` identifier grouping instead of `StateTypeConfig`.

## Alternatives considered

- **Keep explicit `Encounter`/`EncounterEnd` flow nodes (ADR-0002 as-is)** —
  works, but forces every path to carry two extra bracket states per encounter
  purely for scoping, when the membership marker (`EncounterContext`) already
  has to be placed on every contained state anyway.
- **Infer encounter boundaries without an identifier, from marker
  contiguity** (a new encounter starts wherever there's a gap in marked
  elements) — rejected: fragile, since an unrelated but still-marked state
  placed between two encounters, or a single unmarked pass-through state
  inside one encounter, would silently merge or split groups with no explicit
  signal in the diagram.
