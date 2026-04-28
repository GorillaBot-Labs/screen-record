#!/usr/bin/env bash
# Copy the built .app into Applications (prefers /Applications, else ~/Applications).
# Optional flags:
#   --reinstall           Quit + remove existing app before copying
#   --reset-permissions   Reset Screen Recording + Microphone permissions (forces prompts)
#   --keep-permissions    Do not reset permissions (default)
#   --app-id <bundleId>   Override bundle id (default: read from package.json)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REINSTALL=0
RESET_PERMS=0
APP_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reinstall)
      REINSTALL=1
      shift
      ;;
    --reset-permissions)
      RESET_PERMS=1
      shift
      ;;
    --keep-permissions)
      RESET_PERMS=0
      shift
      ;;
    --app-id)
      APP_ID="${2:-}"
      shift 2
      ;;
    -h|--help)
      sed -n '1,40p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Run with --help for usage."
      exit 2
      ;;
  esac
done

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

if [[ "${REINSTALL}" -eq 1 ]]; then
  echo "==> Quit running app (best effort)"
  osascript -e 'tell application "Screen Record" to quit' >/dev/null 2>&1 || true
  pkill -x "Screen Record" >/dev/null 2>&1 || true
  sleep 0.2

  echo "==> Remove existing installs (best effort)"
  rm -rf "${SYSTEM_APPS}" >/dev/null 2>&1 || true
  rm -rf "${USER_APPS}" >/dev/null 2>&1 || true
fi

if [[ "${RESET_PERMS}" -eq 1 ]]; then
  if [[ -z "${APP_ID}" ]]; then
    APP_ID="$(node -e "const p=require('./package.json'); process.stdout.write(p.build?.appId||'')" 2>/dev/null || true)"
  fi
  if [[ -z "${APP_ID}" ]]; then
    APP_ID="com.screenrecord.app"
  fi
  echo "==> Reset macOS permissions for ${APP_ID} (ScreenCapture, Microphone)"
  # tccutil exits non-zero if nothing to reset; ignore.
  tccutil reset ScreenCapture "${APP_ID}" >/dev/null 2>&1 || true
  tccutil reset Microphone "${APP_ID}" >/dev/null 2>&1 || true
fi

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

# Clear quarantine attribute (best effort; may not exist).
xattr -dr com.apple.quarantine "${DEST}" >/dev/null 2>&1 || true

open -R "${DEST}"
