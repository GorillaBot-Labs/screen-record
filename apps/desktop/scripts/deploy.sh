#!/usr/bin/env bash
# Full macOS deploy: typecheck + web/electron build, package (dmg + zip + app),
# copy Screen Record.app into Applications, show release artifacts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

echo "==> Build and package (includes native sck-record via npm run build)"
npm run build:mac

echo ""
echo "==> Reinstall Screen Record.app + reset macOS permissions"
bash "${SCRIPT_DIR}/install-mac-app.sh" --reinstall --reset-permissions

echo ""
echo "==> Deploy finished. Installers and metadata under: ${ROOT}/release/"
ls -1 "${ROOT}/release" 2>/dev/null | sed 's/^/    /' || true
