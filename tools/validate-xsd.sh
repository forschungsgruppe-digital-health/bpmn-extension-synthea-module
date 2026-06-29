#!/usr/bin/env bash
#
# Validate the BPMN *core* of every example diagram against the official
# BPMN 2.0 XSD that ships inside bpmn-moddle.
#
# SCOPE: this checks the standard BPMN structure only. Custom elements under
# <extensionElements> are parsed with processContents="lax" and are NOT
# validated here. Their correctness is covered by the moddle round-trip
# (tools/moddle-roundtrip.mjs) and the bpmnlint plugin.
#
# Requires: xmllint (libxml2-utils) and a prior `npm install`.
set -euo pipefail

XSD="node_modules/bpmn-moddle/resources/bpmn/xsd/BPMN20.xsd"

if ! command -v xmllint >/dev/null 2>&1; then
  echo "xmllint not found. Install libxml2-utils (Debian/Ubuntu) or libxml2 (macOS)." >&2
  exit 1
fi

if [ ! -f "$XSD" ]; then
  echo "BPMN20.xsd not found at $XSD. Run 'npm install' first." >&2
  exit 1
fi

status=0
while IFS= read -r -d '' file; do
  echo "XSD core: $file"
  if ! xmllint --noout --schema "$XSD" "$file"; then
    status=1
  fi
done < <(find examples -name '*.bpmn' -print0)

if [ "$status" -eq 0 ]; then
  echo "All examples are BPMN-core conformant."
fi
exit "$status"
