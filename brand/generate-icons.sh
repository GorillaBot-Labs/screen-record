#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BRAND="$ROOT/brand"
WEB="$ROOT/apps/web"
DESKTOP="$ROOT/apps/desktop"

if ! command -v rsvg-convert >/dev/null; then
  echo "rsvg-convert is required (brew install librsvg)" >&2
  exit 1
fi

render() {
  rsvg-convert -w "$2" -h "$3" "$1" -o "$4"
}

mkdir -p "$WEB/public" "$WEB/app" "$DESKTOP/build" "$DESKTOP/resources" "$DESKTOP/public" "$DESKTOP/src/assets"

cp "$BRAND/logo-square.svg" "$WEB/public/logo.svg"
cp "$BRAND/logo-square.svg" "$WEB/app/icon.svg"
cp "$BRAND/logo-square.svg" "$DESKTOP/public/logo.svg"
cp "$BRAND/logo-square.svg" "$DESKTOP/src/assets/logo.svg"
cp "$BRAND/logo-square.svg" "$DESKTOP/resources/logo.svg"

render "$BRAND/logo-square.svg" 180 180 "$WEB/app/apple-icon.png"
render "$BRAND/logo-square.svg" 32 32 "$WEB/app/favicon-32.png"
magick "$WEB/app/favicon-32.png" -define icon:auto-resize=64,48,32,16 "$WEB/app/favicon.ico"
rm -f "$WEB/app/favicon-32.png"

ICONSET="$DESKTOP/build/icon.iconset"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

for size in 16 32 128 256 512; do
  render "$BRAND/logo-square.svg" "$size" "$size" "$ICONSET/icon_${size}x${size}.png"
  render "$BRAND/logo-square.svg" $((size * 2)) $((size * 2)) "$ICONSET/icon_${size}x${size}@2x.png"
done

iconutil -c icns "$ICONSET" -o "$DESKTOP/build/icon.icns"
rm -rf "$ICONSET"

render "$BRAND/logo-square.svg" 512 512 "$DESKTOP/resources/icon.png"
render "$BRAND/logo-tray.svg" 22 22 "$DESKTOP/resources/trayTemplate.png"

echo "Brand assets generated."
