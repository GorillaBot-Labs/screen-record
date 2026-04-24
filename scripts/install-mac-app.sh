#!/usr/bin/env bash
# Copy the built .app into Applications (prefers /Applications, else ~/Applications).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP=""
if [ -d release ]; then
  APP=$(find release -name "Screen Record.app" -type d -print -quit 2>/dev/null) || true
fi
if [ -z "${APP}" ]; then
  echo "No Screen Record.app under release/. Run: npm run deploy"
  exit 1
fi

SYSTEM_APPS="/Applications/Screen Record.app"
USER_APPS="${HOME}/Applications/Screen Record.app"
mkdir -p "${HOME}/Applications"

DEST=""
if ditto "${APP}" "${SYSTEM_APPS}" 2>/dev/null; then
  DEST="${SYSTEM_APPS}"
  echo "Installed: ${DEST}"
elif ditto "${APP}" "${USER_APPS}" 2>/dev/null; then
  DEST="${USER_APPS}"
  echo "Installed: ${DEST}"
  echo "Tip: ~/Applications is normal for dev installs; Spotlight still finds the app."
else
  echo "Could not copy into Applications. Try:"
  echo "  sudo ditto $(printf %q "${APP}") $(printf %q "${SYSTEM_APPS}")"
  exit 1
fi

open -R "${DEST}"
