#!/usr/bin/env bash
# Build sck-record (Swift). No-op on non-macOS so `npm run dev` / `npm run build` can run elsewhere.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "build-native: skipping (not macOS)"
  exit 0
fi

cd "${ROOT}/native/sck-record"
# Leftover .build from an old checkout path breaks the compiler (PCH / module cache paths).
set +e
swift build -c release
status=$?
set -e
if [[ "${status}" -ne 0 ]]; then
  echo "build-native: swift build failed; cleaning and retrying once"
  swift package clean
  swift build -c release
fi
