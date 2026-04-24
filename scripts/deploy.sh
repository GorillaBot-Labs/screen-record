#!/usr/bin/env bash
# Full macOS deploy: typecheck + web/electron build, package (dmg + zip + app),
# copy Screen Record.app into Applications, show release artifacts.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

echo "==> 1/3 Build (TypeScript + Vite + electron main/preload)"
npm run build

echo ""
echo "==> 2/3 Package for macOS (electron-builder: dir + dmg + zip)"
npx electron-builder --mac

echo ""
echo "==> 3/3 Install Screen Record.app to Applications"
bash "${SCRIPT_DIR}/install-mac-app.sh"

echo ""
echo "==> Deploy finished. Installers and metadata under: ${ROOT}/release/"
ls -1 "${ROOT}/release" 2>/dev/null | sed 's/^/    /' || true
