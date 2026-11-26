# BPMN Extension Synthea Module

**Model a patient pathway in BPMN and turn it into a runnable [Synthea](https://github.com/synthetichealth/synthea) module.**

> **Status: under development — research prototype.**
> The moddle schema, the properties panel and the converter may change without notice.
> Use it with **synthetic data only**; it is not meant to process real patient data.

**Live preview:** <https://forschungsgruppe-digital-health.github.io/bpmn-extension-synthea-module/>
(the modeler with the extension and the converter result for the lung cancer pathway).

BPMN has no probabilities, no Synthea state types and no encounter groups. This repository adds
them as a [bpmn.io](https://bpmn.io) extension in the namespace `synthea:`, without changing the BPMN
standard, and ships a converter that writes the result as Synthea Generic Module Framework (GMF)
JSON. A pathway stays readable for people; the extension carries what the machine needs.

## Funding

This work is part of **MiHUB – Medical Informatics Hub**, a Digital Progress Hub
(Digitaler FortschrittsHub Gesundheit) of the German Medical Informatics
Initiative (MII).

MiHUB is funded by the German Federal Ministry of Research, Technology and Space
(Bundesministerium für Forschung, Technologie und Raumfahrt, BMFTR) under grant
number **01ZZ2506A** (01/2026 – 12/2029). The responsibility for the content of
this publication lies with the authors.

- Project: <https://mihubx.de/mihub/>
- Funding record: [Förderkatalog des Bundes, FKZ 01ZZ2506A](https://foerderportal.bund.de/foekat/jsp/SucheAction.do?actionMode=view&fkz=01ZZ2506A)
- Funder: BMFTR ([ROR 04pz7b180](https://ror.org/04pz7b180))

<details>
<summary>Förderhinweis (deutsch)</summary>

Das diesem Repository zugrunde liegende Vorhaben wurde mit Mitteln des
Bundesministeriums für Forschung, Technologie und Raumfahrt (BMFTR) unter dem
Förderkennzeichen 01ZZ2506A gefördert. Die Verantwortung für den Inhalt dieser
Veröffentlichung liegt bei den Autor:innen.

</details>

## Table of contents

- [Funding](#funding)
- [What is in the repository](#what-is-in-the-repository)
- [Quick start](#quick-start)
- [What the XML looks like](#what-the-xml-looks-like)
- [From BPMN to Synthea](#from-bpmn-to-synthea)
- [What is supported and what is not](#what-is-supported-and-what-is-not)
- [Where do I change what?](#where-do-i-change-what)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Citation](#citation)
- [License](#license)

## What is in the repository

| Part | Where | What it does |
|---|---|---|
| **Moddle descriptor** | `extension/model/synthea.json` | The 28 `synthea:` types (and 13 enums): state type, clinical code, probability, condition, delay, guard, encounter, attribute links, … The XSD in `extension/model/synthea.xsd` is generated from it. |
| **Properties panel** | `extension/src/` | One group "Synthea" in the bpmn-js properties panel, one collapsible section per type, showing only what fits the chosen State Type and what the converter accepts. |
| **Lint plugin** | `extension/lint/bpmnlint-plugin-synthea/` | 33 [bpmnlint](https://github.com/bpmn-io/bpmnlint) rules that catch mistakes while modeling: probability sums over 1, inconsistent encounter groups, missing fields. See [docs/lint-rules.md](docs/lint-rules.md). |
| **Converter** | `extension/src/converter/` | Turns the BPMN files into Synthea GMF JSON and checks the result. |
| **Example pathway** | `examples/lung-cancer/` | The Synthea lung cancer pathway: a main module and four submodules, called through call activities. |
| **Tests** | `extension/test/` | `npm test`: converter, lint rules, properties panel, and the golden files of the example pathway. |
| **Checks and build scripts** | `tools/` | What `npm run validate` runs besides the tests (round trip, XSD, conventions), the generators of the XSD and the module schema, the site build. |
| **Drafts** | `examples/drafts/` | The first draft diagrams (v0.1), kept to show where the models started. |
| **Demo** | `demo/` | A bpmn-js modeler with the extension, for trying it by hand. Not published. |
| **Documentation** | `docs/`, `docs-site/` | Modeling guide, mapping rules, converter concept, extension matrix, architecture decisions; `docs-site/` builds the GitHub Pages site from them. |

## Quick start

Requires Node.js 22 or newer.

```bash
git clone https://github.com/forschungsgruppe-digital-health/bpmn-extension-synthea-module.git
cd bpmn-extension-synthea-module
npm install

npm run demo        # the modeler with the extension, in the browser
npm run validate    # all checks (lint, round trip, XSD, tests, converter)
```

Or with Docker: `docker compose up` serves the modeler on <http://localhost:5173/>.

The modeler opens your own `.bpmn` files or a whole folder; the **Examples** menu opens the lung cancer
pathway. Everything stays in the browser. **Convert to Synthea** shows the Synthea module as a graph, as
JSON and as messages that explain what to fix.

**First steps:** the [Quickstart](docs/quickstart.md) (with screenshots) walks through an example, a
change, a conversion and a tiny pathway of your own, in about ten minutes. On the
[live preview](https://forschungsgruppe-digital-health.github.io/bpmn-extension-synthea-module/) the same
guides sit next to the modeler.

## What the XML looks like

Everything is stored as standard BPMN `extensionElements` in the namespace `synthea:`; tools that do not
know the extension keep the model unchanged:

```xml
<bpmn:task id="Task_1" name="Diagnosis: Anemia">
  <bpmn:extensionElements>
    <synthea:stateTypeConfig stateType="ConditionOnset" codeSystem="http://snomed.info/sct"
                             code="271737000" codeDisplay="Anemia (disorder)" />
  </bpmn:extensionElements>
</bpmn:task>
```

A larger example, and how to register the extension in your own bpmn-js modeler or read the data in
Node, is in [docs/extension-api.md](docs/extension-api.md). The package is not on npm; use it as a file
dependency (`"bpmn-js-synthea-extension": "file:../bpmn-extension-synthea-module"`), as
[`examples/consumer/`](examples/consumer/) does.

## From BPMN to Synthea

```bash
npm run bpmn2gmf -- examples/lung-cancer --out-dir out/modules   # write the Synthea modules
tools/generate-testdata.sh out                                    # convert, run Synthea v4.0.0, write FHIR patients to out/
docker compose run --rm testdata                                  # the same in Docker
```

[docs/converter-overview.md](docs/converter-overview.md) has the options (`--strict`, `--check`,
`--fuse-gateways`), the stages of the converter, how to convert your own pathway and the options of the
test data script.

## What is supported and what is not

Exclusive gateways with probabilities or conditions on their flows, timers, call activities and
sub-processes convert directly; structured parallel and inclusive blocks are rewritten into a sequence.
Boundary events, complex and event-based gateways, event and ad-hoc sub-processes, transactions, loop
markers and the `Physiology` state are rejected with their own error code, and the menus of the modeler
do not offer them. [docs/extension-matrix.md](docs/extension-matrix.md) lists, per BPMN element, which
`synthea:` type the panel offers and what the converter does with it.

## Where do I change what?

| I want to … | Change | Then run |
|---|---|---|
| add a field or a type | `extension/model/synthea.json` | `npm run xsd:gen`, `npm run roundtrip` |
| show it in the panel | `extension/src/SyntheaPropertiesProvider.js` (`getGroups`, a `create…Group` function, an entry from `makeTextEntry` / `makeSelectEntry` / `makeCheckboxEntry`) | `npm run demo` |
| add a lint rule | a file in `extension/lint/bpmnlint-plugin-synthea/rules/`, an entry in its `index.js` (in `rules` **and** `configs.all.rules`), a fixture in `examples/valid/` and `examples/invalid/` | `npm run lint:valid`, `npm run lint:invalid` |
| write the field into the JSON | `extension/src/converter/emit.mjs` (per state type), `required-fields.mjs`, a test in `extension/test/convert.test.mjs` | `npm test`, `npm run convert:check` |
| change how a BPMN element maps to a state | `docs/implicit-rules.md`, `extension/src/converter/resolve.mjs`, `transitions.mjs` | `npm test` |
| offer another example in the demo | the `.bpmn` file in `examples/lung-cancer/` (the **Examples** menu lists every file there), its menu name in `EXAMPLE_LABELS` in `demo/src/main.js` | `npm run demo` |

`npm run validate` runs the whole gate in two stages: `validate:diagram` (is the BPMN a valid input: lint,
round trip, both XSDs, generated files up to date) and `validate:convert` (module schema, `npm test` with the
golden files of the lung cancer pathway, strict conversion), with the package conventions and the JSDoc check
in between. [docs/validator-overview.md](docs/validator-overview.md) lists every step. `npm run lint:invalid`
is **expected to fail**: the diagrams in `examples/invalid/` prove that the rules fire.

## Documentation

| Document | Content |
|---|---|
| [docs/basics.md](docs/basics.md) | BPMN and Synthea in five minutes, for readers who know neither |
| [docs/quickstart.md](docs/quickstart.md) | The first module, step by step with screenshots |
| [docs/glossary.md](docs/glossary.md) | The words used in this documentation |
| [docs/modeling-guide.md](docs/modeling-guide.md) | How to model a pathway so it converts: what to draw, what to set in the panel |
| [docs/implicit-rules.md](docs/implicit-rules.md) | The mapping rules BPMN → Synthea: nodes, edges, gateway chains |
| [docs/bpmn2gmf-concept.md](docs/bpmn2gmf-concept.md) | The converter: pipeline, decisions, comparison with Synthea's lung cancer module |
| [docs/converter-overview.md](docs/converter-overview.md) | What the converter does: options, the stages of the pipeline, the golden files |
| [docs/validator-overview.md](docs/validator-overview.md) | What the validator does: the checks that `npm run validate` runs, in order |
| [docs/lint-rules.md](docs/lint-rules.md) | The 33 lint rules in one table: ID, severity and what each one checks |
| [docs/extension-api.md](docs/extension-api.md) | The extension API: register it in bpmn-js, read the data in Node, what the XSD checks |
| [docs/extension-api-types.md](docs/extension-api-types.md) | The `synthea:` types, attributes and enumerations (generated from the moddle descriptor) |
| [docs/extension-matrix.md](docs/extension-matrix.md) | Which `synthea:` type sits on which BPMN element (panel and converter) |
| [docs/synthea.md](docs/synthea.md) | Background: Synthea in depth, its Generic Module Framework and where it meets BPMN |
| [docs/concepts.md](docs/concepts.md) | Background: what a BPMN extension is and how the pieces fit |
| [docs/adr/](docs/adr/) | Architecture decisions (versioning, encounter scope) |
| [examples/lung-cancer/README.md](examples/lung-cancer/README.md) | The example pathway and how it converts |
| [CONTRIBUTING.md](CONTRIBUTING.md), [AGENTS.md](AGENTS.md) | Contributing, and the rules for AI coding agents |

## Contributing

```bash
npm install
npm run validate
```

Run `npm run validate` before a commit or pull request. Commits follow
[Conventional Commits](https://www.conventionalcommits.org/): `fix:` makes a patch, `feat:` a minor
version (a patch while below 1.0.0), `feat!:` a major one (a minor while below 1.0.0). [Release Please](https://github.com/googleapis/release-please) turns them
into a release pull request; do not change the version by hand. The namespace `uri` and `prefix` of the
extension must not change, or diagrams already in the wild break. See [CONTRIBUTING.md](CONTRIBUTING.md)
and [AGENTS.md](AGENTS.md).

## Citation

If you use this software, please cite it using the metadata in [CITATION.cff](CITATION.cff).

## License

[MIT](LICENSE).

The pathway models in `examples/lung-cancer/` and the files in `extension/test/golden/` are modeled after
and generated from Synthea modules, which are Apache-2.0 licensed (Copyright The MITRE Corporation and the
Synthea contributors); the license text and Synthea's notices on RxNorm, LOINC and SNOMED CT are in
`LICENSE` and `NOTICE.md` in `examples/lung-cancer/`.

The demo uses [bpmn-js](https://github.com/bpmn-io/bpmn-js), which is MIT licensed with one additional
condition: the bpmn.io watermark must not be removed or hidden in any application that uses it. See
<https://bpmn.io/license/>.
