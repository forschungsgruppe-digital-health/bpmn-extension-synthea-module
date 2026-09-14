# ADR-0002: Model Encounter/EncounterEnd as flow nodes, not TextAnnotation

- **Status:** superseded by [ADR-0003](0003-encounter-context-implicit-scoping.md)
- **Date:** 2026-09-14
- **Deciders:** extension maintainers (pending confirmation — see Consequences)

## Context

`docs/implicit-rules.md` originally modeled `Encounter`/`EncounterEnd` the same
way as the other ten states that share a `TextAnnotation` (Table B.1):
disambiguated by `fhirmap:resourceType="Encounter"` plus ordering relative to a
paired counterpart. That created a reference problem specifically for
`synthea:WellnessConfig`: wellness only applies to an Encounter, but a
`WellnessConfig` living on the annotation had no formal way to say *which*
Encounter it belonged to. Earlier iterations worked around this with a
free-text lookup and then an invented `encounterState` cross-reference field —
neither is expressible in the moddle descriptor without a made-up attribute
that has no Synthea counterpart.

A concept document found in the org's `bpmn-js-clinical-semantics` monorepo
(`docs/concepts/synthea-gmf-module-mapping.md`, marked "concept/proposal — not
implemented") sketches an alternative: model `Encounter` as an ordinary flow
node (Task/EndEvent), the same way every other state type is modeled, rather
than as an annotation. That removes the cross-element reference problem
entirely — `WellnessConfig` becomes a same-element check against the sibling
`StateTypeConfig`, exactly like `DelayConfig` already is for `Delay` states.

## Decision

We model `Encounter`/`EncounterEnd` as ordinary flow nodes (`Task` / `EndEvent`
/ `SubProcess`) carrying a `synthea:StateTypeConfig`, not as a `TextAnnotation`.

- `synthea:WellnessConfig` is simplified to a single `wellness` boolean and
  sits on the **same element** as the `StateTypeConfig` it applies to (wired
  in `SyntheaPropertiesProvider.js` for `EndEvent`/`Task`/`SubProcess`,
  alongside the `StateTypeGroup`).
- The `wellness-requires-encounter-state` lint rule (SYN-19) checks only that
  the sibling `StateTypeConfig.stateType` is `Encounter` or `EncounterEnd` —
  no annotation lookup, no association traversal.
- `synthea:EncounterContext` is **not** part of this decision and stays on
  `TextAnnotation` for now (see Consequences).

## Consequences

- `WellnessConfig` and its lint rule are simpler and more robust: a same-element
  check can't go stale the way a text-search or hand-invented reference field
  could.
- Encounter now follows the same modeling pattern as every other state
  (`StateTypeConfig` on the state-bearing element), reducing the number of
  distinct patterns a modeler has to learn.
- **Open before this can be marked accepted:** `docs/implicit-rules.md` Table B
  and B.1 still list `Encounter`/`EncounterEnd` under "Text annotation" states,
  disambiguated by `fhirmap:resourceType` and pairing order. Adopting this ADR
  means diagrams must actually be drawn with Encounter as a Task/EndEvent
  instead — a modeling-convention change beyond the extension files, not yet
  implemented or agreed for the existing lung-cancer example modules. Table B/B.1
  need a follow-up pass once that's confirmed.
- Left open, not decided by this ADR: whether `synthea:EncounterContext`
  (a bridging construct marking that certain states must occur inside an
  Encounter block) should make the same move off `TextAnnotation`. It has no
  Synthea equivalent to model as a flow node's own state type, so the same
  argument doesn't directly transfer.

## Alternatives considered

- **Keep `Encounter` as `TextAnnotation`, give `WellnessConfig` an explicit
  cross-reference attribute** (e.g. `encounterState`) — rejected: the
  reference target has no Synthea counterpart, so it would be a bridging field
  invented purely to work around the annotation's lack of identity, adding a
  concept with no real-world meaning.
- **Keep the free-text/association lookup** — rejected: fragile (depends on
  note text or diagram association wiring), and the org's own concept sketch
  already identifies the flow-node approach as the more robust one.
