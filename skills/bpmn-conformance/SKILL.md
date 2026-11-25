---
name: bpmn-conformance
description: Validate a .bpmn file or a custom BPMN extension for BPMN 2.0 conformance and house conventions before commit or PR. Use when checking, validating, or reviewing BPMN diagrams or extension changes.
---

# BPMN conformance check

Run the deterministic checks in order and report results per stage. The
pass/fail decision comes from the tools, never from your own reading.

1. `npm run lint:valid` — bpmnlint (`recommended` + plugin rules) over `examples/valid/`. Must pass.
2. `npm run lint:invalid` — over `examples/invalid/`. Must FAIL. This is a negative test proving the rules actually fire; a pass here means a rule is broken.
3. `npm run roundtrip` — moddle `fromXML`/`toXML` with the custom extension registered. Confirms extension data parses and serialises without warnings or loss.
4. `npm run xsd` — validates the BPMN **core** against the official BPMN20.xsd.

`npm run validate` chains 1, 3, 4, the generated-XSD checks (5), the conventions check and the converter checks (`npm run test:bpmn2gmf` with the golden files, `convert:check`) for the common case, in two stages: `npm run validate:diagram` (is the BPMN a valid input) and `npm run validate:convert` (does the conversion work). Step 2 and `npm run synthea:smoke` run on their own.

5. `npm run xsd:gen:check` and `npm run xsd:ext` — the extension XSD is generated from the moddle descriptor and `extension/model/synthea.values.json`; `xsd:gen:check` confirms the committed copy matches, `xsd:ext` validates the examples against the BPMN core XSD **and** the extension XSD. Both are part of `npm run validate`.

## Scope boundary — state this in every report
The plain XSD step (4) checks the BPMN core only. Data under
`<extensionElements>` is parsed with `processContents="lax"` and is NOT covered
by it. The extension XSD (5) adds validation of the extension data's *structure*
and of its fixed choices (state type, time unit, operator, gender, race), but
never of rules across fields or elements. Those are the lint (1), which also runs
the converter's own checks before the conversion, and the round trip (3). Never
report "XSD passed" as "the extension is valid".

## On failure
Summarise each failing stage, quote the tool's own message, and propose a
minimal fix. Do not edit files unless asked.
