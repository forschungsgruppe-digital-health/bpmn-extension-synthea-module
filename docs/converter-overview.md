# What the converter does

An overview of `extension/src/converter/`. The full design, the build order and the decisions are in [bpmn2gmf-concept.md](bpmn2gmf-concept.md); the mapping rules are in [implicit-rules.md](implicit-rules.md); what a modeler has to draw is in [modeling-guide.md](modeling-guide.md).

**What it does:** turns BPMN pathway models that use the `synthea:` extension into Synthea Generic Module Framework (GMF) `.json` modules. The diagram stays the readable source; the JSON is the format the Synthea engine runs.

```bash
npm run bpmn2gmf -- examples/lung-cancer          # write the JSON modules to out/modules
npm run bpmn2gmf -- examples/lung-cancer --check  # convert and report, write nothing
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
| 12 | Verify and write | `verify.mjs`, `required-fields.mjs`, `layout.mjs`, `write.mjs` | `verify.mjs` checks the JSON: `Terminal` has no transition, every other state has one, targets exist, distributions sum to 1 and states are reachable from `Initial` (warnings), called sub-modules exist, no cycles between them. `verify-flow.mjs` adds the order checks on the JSON (a wait after `Initial`, encounter scope, start before end, Guard attributes); [validator-overview.md](validator-overview.md) lists them with the check of Kramer et al. 2025 each one comes from and how often they fire on Synthea's own modules. `required-fields.mjs` holds the required fields per state type from the Synthea wiki (a JSON Schema is generated from it, see [validator-overview.md](validator-overview.md)); a missing one is reported, never guessed (without `--strict` the state gets a remark `bpmn2gmf: not complete, …`). `layout.mjs` decides the file locations: a module that nobody calls goes to `<name>.json` and runs for every patient, a called module to `<root>/<name>.json`, and every `CallSubmodule` gets that path. `write.mjs` writes; a module with an error is not written |

Problems are collected by `diagnostics.mjs` on three levels: **errors** stop a module from being written, **warnings** and **notes** are only reported. Every message has a code, the module and the element id.

## Golden files

The five files in `examples/lung-cancer/` are converted together and strictly, and each module must equal its file in `extension/test/golden/` (`golden.test.mjs`, part of `validate`). A change that alters a module fails there; if it is intended, `UPDATE_GOLDEN=1 npm test` rewrites the files and the diff shows what changed.

The comparison with Synthea's own lung cancer modules (by content and state by state) is kept on the branch `upstream-comparison`; it is not part of `dev`.

## Your own pathway

Put the `.bpmn` files of one pathway into a folder of their own; the files in it may call each other. Then:

```bash
npm run bpmn2gmf -- my-pathway --strict --out-dir out/modules
```

An error names the element and says what to do, and a module with an error is not written. A warning is a hint: for a `ConditionOnset` right after `Initial` it says that every patient gets the condition at birth, which is fine for a submodule that another module calls. Which element needs which fields is in the [modeling guide](modeling-guide.md).

A module that nobody calls is written to `<name>.json`, the modules it calls to the folder `<name>/` next to it, because Synthea runs every file directly in its modules directory for every patient and treats only files in a subfolder as submodules (stage 12 above).

## Run the modules in Synthea

To generate synthetic FHIR patients from a pathway folder, run the script. It needs Java and Node; it downloads the pinned Synthea v4.0.0 jar (about 200 MB) once into `~/.cache/bpmn-extension-synthea` and checks its SHA-256:

```bash
tools/generate-testdata.sh out                                   # examples/lung-cancer/, 1000 patients, seed 7, ages 45-65
tools/generate-testdata.sh out --dir my-pathway --population 1000 --seed 3 --age 45-65
tools/generate-testdata.sh out --force-diagnosis                 # only for the lung cancer module: every patient is diagnosed
docker compose run --rm testdata                                 # the same in Docker, writes to ./out
```

The FHIR bundles are in `out/out/fhir`, the converted modules in `out/modules`. `SYNTHEA_JAR=<path>` uses a jar you already have. With the same options it produces the same patients on every machine and in Docker (the script fixes the time zone to UTC; without that, the host time zone shifts the simulated dates); the file contents differ only in time stamps.

The script is a thin wrapper around `tools/synthea-smoke.mjs`, which it calls with `--keep`. That lower-level command checks that Synthea loads the modules and finds the submodules, and can show which submodules were entered:

```bash
npm run synthea:smoke -- <path to synthea-with-dependencies.jar>
npm run synthea:smoke -- <path to the jar> --force-diagnosis                      # every patient takes the disease and treatment path
npm run synthea:smoke -- <path to the jar> --force-diagnosis --trace-submodules   # shows which submodules were entered
```

Neither is part of `validate`.

## Try it without a checkout

- **Convert to Synthea** in the demo (`npm run demo`, or the published site) runs this converter in the
  browser on the open diagram: graph of the states and transitions, JSON, and the messages grouped by
  kind with an explanation (`extension/src/converter/explanations.mjs`). It is the same code as the command line;
  `test/browser-parity.test.mjs` bundles the converter for the browser and checks that it gives the same
  modules and messages, which also fails on any Node-only import in the core.
- **Converter result** (`modules/` on the published site, `npm run convert:site` locally) lists the
  JSON modules and the report that `tools/build-converter-site.mjs` made from `examples/lung-cancer/`, with
  `build.json` (the commit it was built from). The Pages workflow runs it after the demo build and
  `tools/check-pages-build.mjs` before the deploy.

## Related

- [validator-overview.md](validator-overview.md): the checks that `npm run validate` runs, including `npm test` with the golden files and `convert:check`.
- [lint-rules.md](lint-rules.md): the lint rules that check the `synthea:` data before it reaches the converter.

## Limits

- Only the lung cancer module is compared with the original; other Synthea modules are not.
- Engine runs (`npm run synthea:smoke`) are samples with fixed seeds and are not part of `validate`.
