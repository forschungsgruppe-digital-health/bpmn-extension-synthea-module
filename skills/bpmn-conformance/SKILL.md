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

`npm run validate` chains 1, 3, 4 and the conventions check for the common case.

5. *(Optional)* `npm run xsd:ext` — validates the examples against the BPMN core XSD **and** an extension XSD generated from the moddle descriptor, so structural errors in the custom data are caught too. Run `npm run xsd:gen:check` first to confirm the committed XSD is not stale. Still structure-only; semantics stay in step 1.

## Scope boundary — state this in every report
The plain XSD step (4) checks the BPMN core only. Data under
`<extensionElements>` is parsed with `processContents="lax"` and is NOT covered
by it. The optional `xsd:ext` step (5) adds *structural* validation of the
extension data but never its *semantics*. Extension correctness is established
by steps 1 and 3 (and, structurally, 5). Never report "XSD passed" as
"the extension is valid".

## On failure
Summarise each failing stage, quote the tool's own message, and propose a
minimal fix. Do not edit files unless asked.
