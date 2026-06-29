---
name: moddle-extension-review
description: Review a moddle extension descriptor (the JSON model file) for correct structure and namespace hygiene. Use when creating or changing files under extension/model/.
---

# Moddle extension descriptor review

Check every `extension/model/*.json` descriptor against these rules:

- `name`, `uri`, and `prefix` are all present; the `uri` is a stable, owned URI.
- Types that attach under `bpmn:extensionElements` declare `"superClass": ["Element"]`.
- Attributes use `"isAttr": true`; repeatable children use `"isMany": true`; text content uses `"isBody": true`.
- The `prefix` is never `bpmn`, `bpmndi`, `dc`, or `di` — custom data must live in its own namespace.
- Flag any attempt to extend top-level `bpmn:Definitions`: the stock XSD does not cleanly allow it.

Confirm the descriptor still parses by running `npm run roundtrip`.
Report findings; do not edit unless asked.
