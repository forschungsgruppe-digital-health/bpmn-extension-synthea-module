# ADR-0003: Encounter scope is derived from `EncounterContext`, not drawn explicitly

- **Status:** proposed
- **Date:** 2026-09-14
- **Deciders:** extension maintainers (pending confirmation — see Consequences)
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

- `synthea:EncounterContext` gains a second attribute alongside
  `requiresEncounterContext` — an encounter identifier (exact name TBD, e.g.
  `encounterId`) — shared by every state belonging to the same encounter
  instance.
- Every clinical state inside an encounter carries `EncounterContext` with
  that identifier individually; there is no single "start" or "end" marker to
  draw.
- `tools/bpmn2gmf` groups marked states by identifier, takes each group's
  first-to-last span in sequence-flow order, and **synthesizes** the
  `Encounter` and `EncounterEnd` GMF states around that span in the generated
  JSON — they exist only in the output, not in the source BPMN diagram.
- `StateType.Encounter` / `StateType.EncounterEnd` and the corresponding
  branch of `wellness-requires-encounter-state` (SYN-19) become unused by this
  mechanism (see Consequences — removal is a follow-up, not decided here).

## Consequences

- Modelers no longer draw or place bracket states for an encounter, or worry
  about whether `Encounter` is a Task, EndEvent, or annotation (ADR-0002's
  open question about the diagram convention is moot for this path).
- Multiple, separate encounters in one path are representable without
  ambiguity, via the identifier grouping.
- **Open, not decided by this ADR: where `WellnessConfig` attaches.** It
  previously sat on the same element as `StateTypeConfig.stateType="Encounter"`
  (ADR-0002). With no such element to draw, it needs a new home — candidates
  include a `wellness` field directly on `EncounterContext`, or keeping
  `WellnessConfig` as a separate marker on one designated state per encounter
  group. Not resolved here; needs a decision before implementation.
- **Follow-up work implied, not yet done:** the `StateType` enum still lists
  `Encounter`/`EncounterEnd`; `wellness-requires-encounter-state` (SYN-19)
  still checks for a sibling `StateTypeConfig`; `docs/implicit-rules.md`
  Table B/B.1 still describe `Encounter`/`EncounterEnd` as annotation-disambiguated
  states. All three need a pass once the `WellnessConfig` question above is
  settled, so the rework happens once instead of twice.
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
