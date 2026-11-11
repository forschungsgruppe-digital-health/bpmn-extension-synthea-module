# What the converter does

An overview of `tools/bpmn2gmf/`. The full design, the build order and the decisions are in [bpmn2gmf-concept.md](bpmn2gmf-concept.md); the mapping rules are in [implicit-rules.md](implicit-rules.md); what a modeler has to draw is in [modeling-guide.md](modeling-guide.md).

**What it does:** turns BPMN pathway models that use the `synthea:` extension into Synthea Generic Module Framework (GMF) `.json` modules. The diagram stays the readable source; the JSON is the format the Synthea engine runs.

```bash
npm run bpmn2gmf -- lung-cancer          # write the JSON modules to out/modules
npm run bpmn2gmf -- lung-cancer --check  # convert and report, write nothing
```

| Option | Effect |
|---|---|
| `--out-dir <dir>` | where the JSON modules are written (default `out/modules`) |
| `--check` | run the whole conversion and report errors, warnings and notes, but write nothing |
| `--strict` | a required field that is missing is an error and the module is not written |
| `--fuse-gateways` | merge `Simple` states that exist only because of a gateway (output closer to hand-written modules) |

The input is one or more `.bpmn` files or a folder. Every process in a file, and every sub-process inside it, becomes a module of its own.

## Pipeline

`cli.mjs` is the command-line entry point and calls `convert.mjs`, which runs the stages in this order. Each stage is one file. Stages 3 to 5 run while `ir.mjs` builds the intermediate form (stage 2), so they happen before the state types are resolved.

| # | Stage | File | What it does |
|---|---|---|---|
| 1 | Read | `parse.mjs` | loads the file with `bpmn-moddle` and the `synthea:` descriptor. `i18n:` and `cp:` (BPMN4CP) have no descriptor on purpose, moddle keeps them as generic elements. A file that cannot be parsed is `PARSE_FAILED`; parser warnings are reported as errors so nothing is lost silently |
| 2 | Intermediate form | `ir.mjs` | builds an intermediate representation (IR) of nodes, sequence flows and `synthea:` configuration, and drops what GMF does not need: layout, annotations, associations, i18n, BPMN4CP, data objects. Constructs GMF cannot express, such as boundary events, are errors (`UNSUPPORTED_ELEMENT`) that say what to draw instead; a file without a process is `NO_PROCESS`. A sub-process becomes a module of its own, called through `CallSubmodule` |
| 3 | Documentation-only | `documentation.mjs` | an element with `synthea:DocumentationOnly` stays in the diagram but gets no state; its incoming flows are joined to its outgoing flow. Only tasks, gateways and intermediate events qualify, with at least one incoming and exactly one outgoing flow |
| 4 | Link events | `links.mjs` | a link throw event and the catch event with the same name are one jump drawn in two pieces. The pair is removed and the flows go straight to what follows the catch event. Paired by name, ignoring case and blanks; a missing name or two catches with one name are errors |
| 5 | Parallel / inclusive gateways | `gateways.mjs` | GMF has neither parallelism nor "any of these", so a split and its join are rewritten into a sequence. Parallel: the branches run one after the other in the order of the flows. Inclusive: a `Simple` state per branch decides with the condition or probability of its flow. Structured blocks only (one way in and out per branch, one join of the same kind), nested blocks are rewritten from the inside out |
| 6 | State type and name | `resolve.mjs` | the state type is explicit on `synthea:stateTypeConfig` or derived: start → `Initial`, end → `Terminal`, timer → `Delay`, gateway → `Simple` (with a `GuardConfig` → `Guard`), call activity and sub-process → `CallSubmodule`. Each kind of element allows a fixed set only (a start event only `Initial`, an end event `Terminal` or `Death`). A task without a type or an unknown type (`STATE_TYPE_UNKNOWN`) is an error, there is no guessing. Duplicate state names are renamed and noted |
| 7 | Encounters | `encounters.mjs` | the diagram has no `Encounter` states, only `encounterId` tags on clinical states ([ADR-0003](adr/0003-encounter-context-implicit-scoping.md)). The stage derives `Encounter` and `EncounterEnd`: the tagged states and all nodes between them are the span, untagged states then keep the encounter open until a boundary (long `Delay`, `Terminal`, `Death`, `CallSubmodule`, another encounter), and it ends right after the last state that uses it. A delay of a week or more between two tagged states, or of a day or more after the last one, ends it. Errors: incomplete code, missing `encounterId`, wellness together with a class, contradicting values in a group, an encounter that spans a sub-process boundary |
| 8 | Transitions | `transitions.mjs` | the outgoing flows become `direct_transition`, `distributed_transition` (probabilities, the last flow without a value takes the remainder) or `conditional_transition` (conditions, a flow without one is the fallback), see table C in [implicit-rules.md](implicit-rules.md). Errors: more than one flow without probability or condition, probability and attribute together, an attribute without default, an invalid condition |
| 9 | Conditions and codes | `conditions.mjs`, `codes.mjs` | `synthea:Condition` becomes the GMF condition object: numbers become numbers, `true` and `false` booleans, the rest stays text. Entities are named by an attribute or by a code, never both, and a code is always system, code and display. `codes.mjs` maps code-system URIs (SNOMED, LOINC, RxNorm, CVX, …) to the names Synthea expects and defines which systems each state type accepts |
| 10 | Emit states | `emit.mjs` | builds the JSON of each state without its transition. An end state (`ConditionEnd`, `MedicationEnd`, …) is matched with its start: an explicit attribute link wins, otherwise the nearest matching start upstream. A `Death` state drawn as an end event gets a transition to the module's `Terminal` state; if there is none, one is added (note `TERMINAL_SYNTHESIZED`) |
| 11 | Fuse gateways | `fuse.mjs` | only with `--fuse-gateways`. Removes `Simple` states that exist only for a gateway: pass-through gateways (joins) and gateways entered from one state, whose branching moves onto that state. A conditional state whose branches lead into probability gateways becomes one `complex_transition`. Kept as drawn: `Simple` tasks, gateways with several predecessors, gateways a `PriorState` condition refers to |
| 12 | Verify and write | `verify.mjs`, `required-fields.mjs`, `layout.mjs`, `write.mjs` | `verify.mjs` checks the JSON: `Terminal` has no transition, every other state has one, targets exist, distributions sum to 1 and states are reachable from `Initial` (warnings), called sub-modules exist, no cycles between them. `verify-flow.mjs` adds the order checks (Level 1 in the sense of Kramer et al. 2025; warnings and notes, because a graph cannot see that two branches exclude each other): a wait after `Initial` (`INITIAL_WITHOUT_WAIT`, only for a module nobody calls), an open `Encounter` for every state that needs one (`ENCOUNTER_REQUIRED`) and one still open at `Terminal` (`ENCOUNTER_NOT_ENDED`, a note: the wiki only recommends an `EncounterEnd`), an end state that follows its start state (`END_BEFORE_START`, `END_START_MISSING`, `END_START_TYPE`), and a `Guard` on an attribute no module sets (`GUARD_ATTRIBUTE_NEVER_SET`, a note: Synthea sets some attributes itself). The rules were tried on the 536 modules shipped with Synthea 4.0.0; `docs/validator-overview.md` lists the hit rates. `required-fields.mjs` holds the required fields per state type from the Synthea wiki (a JSON Schema is generated from it, see [validator-overview.md](validator-overview.md)); a missing one is reported, never guessed (without `--strict` the state gets a remark `bpmn2gmf: not complete, …`). `layout.mjs` decides the file locations: a module that nobody calls goes to `<name>.json` and runs for every patient, a called module to `<root>/<name>.json`, and every `CallSubmodule` gets that path. `write.mjs` writes; a module with an error is not written |

Problems are collected by `diagnostics.mjs` on three levels: **errors** stop a module from being written, **warnings** and **notes** are only reported. Every message has a code, the module and the element id.

## Comparison with the original modules

| Check | Files | Result |
|---|---|---|
| Content (`npm run compare:upstream`, not part of `validate`) | `compare.mjs`, `compare-upstream.mjs` | each clinical state reduced to type, codes and key values; both lists compared as sets; informational, exit 0 |
| Structure (`npm run compare:structure`, part of `validate`) | `structure.mjs`, `compare-structure.mjs` | both state graphs walked from `Initial` together; compares paired states, conditions, probabilities (with order) and targets; names, `remarks`, `reason` and pure pass-through states do not count; known differences are listed with a reason, anything else is exit 1 |

The reference is the module set of Synthea master in `tools/bpmn2gmf/test/upstream/`.

## Related

- [validator-overview.md](validator-overview.md): the checks that `npm run validate` runs, including the converter tests, `convert:check` and `compare:structure`.
- [lint-rules.md](lint-rules.md): the lint rules that check the `synthea:` data before it reaches the converter.

## Limits

- Only the lung cancer module is compared with the original; other Synthea modules are not.
- Engine runs (`npm run synthea:smoke`) are samples with fixed seeds and are not part of `validate`.
