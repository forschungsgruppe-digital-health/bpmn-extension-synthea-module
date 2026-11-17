#!/usr/bin/env bash
# Generates a synthetic FHIR test data set from a BPMN pathway folder.
#
#   scripts/generate-testdata.sh <output dir> [--dir lung-cancer] [--population 1000]
#                                [--seed 7] [--age 45-65] [--force-diagnosis]
#
# What it does: checks for Java, downloads the pinned Synthea jar (v4.0.0, the version the
# converter was tested with) into a cache folder if it is missing, runs tools/synthea-smoke.mjs
# (convert, then Synthea) and prints a short summary. The FHIR bundles end up in <output dir>/out/fhir,
# the converted modules in <output dir>/modules.
#
# Environment:
#   SYNTHEA_JAR        use this jar instead of the cached download (no download, no hash check)
#   SYNTHEA_CACHE_DIR  where the jar is cached (default: ~/.cache/bpmn-extension-synthea)
#
# Defaults when not given: --population 1000 --seed 7 --age 45-65 (about 1 GB of FHIR, some 15 s).
# --trace-submodules is not offered here: its marker states change the random draws.
set -euo pipefail

JAR_VERSION="v4.0.0"
JAR_URL="https://github.com/synthetichealth/synthea/releases/download/${JAR_VERSION}/synthea-with-dependencies.jar"
JAR_SHA256="ed43c20ad40ba5c3bc724503a5af032715fe3c491620b766148e7c2361e6ecc1"

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  sed -n '2,19p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  exit "${1:-2}"
}

[[ $# -ge 1 && "$1" != -* ]] || usage
out="$1"; shift
for a in "$@"; do
  case "$a" in
    -h|--help) usage 0 ;;
    --trace-submodules) echo "error: --trace-submodules changes the random draws and is not supported here." >&2; exit 2 ;;
  esac
done

if ! command -v java >/dev/null 2>&1; then
  echo "error: Java not found. Install a JDK (Synthea v4 needs Java 17 or newer), or use the Docker image." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js not found (Node 22). Install it, or use the Docker image." >&2
  exit 1
fi

sha256() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

if [[ -n "${SYNTHEA_JAR:-}" ]]; then
  jar="$SYNTHEA_JAR"
  [[ -f "$jar" ]] || { echo "error: SYNTHEA_JAR=$jar does not exist." >&2; exit 1; }
else
  cache="${SYNTHEA_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/bpmn-extension-synthea}"
  jar="$cache/synthea-with-dependencies-${JAR_VERSION}.jar"
  if [[ ! -f "$jar" || "$(sha256 "$jar")" != "$JAR_SHA256" ]]; then
    mkdir -p "$cache"
    echo "Downloading Synthea ${JAR_VERSION} (about 200 MB) to $cache ..."
    tmp="$jar.part"
    curl -fL --retry 3 -o "$tmp" "$JAR_URL"
    if [[ "$(sha256 "$tmp")" != "$JAR_SHA256" ]]; then
      rm -f "$tmp"
      echo "error: the downloaded jar does not match the pinned SHA-256." >&2
      exit 1
    fi
    mv "$tmp" "$jar"
  fi
fi

# Defaults: lung cancer is rare, so 400 patients (the engine default) often give nobody with a diagnosis.
defaults=()
has() { local f; for f in "$@"; do [[ " $* " == *" --$name "* ]] && return 0; done; return 1; }
for name in population seed age; do
  has "$@" || case "$name" in
    population) defaults+=(--population 1000) ;;
    seed) defaults+=(--seed 7) ;;
    age) defaults+=(--age 45-65) ;;
  esac
done

# The time zone changes the simulated dates and so the patients; UTC makes the output the same on every machine (and in Docker).
export TZ=UTC

mkdir -p "$out"
cd "$root"
echo "Generating test data into $out ..."
node tools/synthea-smoke.mjs "$jar" --keep "$out" ${defaults[@]+"${defaults[@]}"} "$@"

echo
echo "FHIR bundles: $(find "$out/out/fhir" -name '*.json' 2>/dev/null | wc -l | tr -d ' ') files in $out/out/fhir"
echo "Converted modules: $out/modules"
