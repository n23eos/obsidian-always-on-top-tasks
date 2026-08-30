#!/bin/zsh
# Build SimpleFocus.app bundle from the Swift package (release mode).
set -euo pipefail

cd "$(dirname "$0")"

APP_NAME="SimpleFocus"
BUILD_DIR=".build/release"
APP_DIR="dist/${APP_NAME}.app"

echo "→ swift build -c release"
swift build -c release

echo "→ assembling ${APP_DIR}"
rm -rf "${APP_DIR}"
mkdir -p "${APP_DIR}/Contents/MacOS" "${APP_DIR}/Contents/Resources"

cp "${BUILD_DIR}/${APP_NAME}" "${APP_DIR}/Contents/MacOS/${APP_NAME}"

cat > "${APP_DIR}/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>SimpleFocus</string>
    <key>CFBundleIdentifier</key>
    <string>com.nickeo23.simplefocus</string>
    <key>CFBundleName</key>
    <string>SimpleFocus</string>
    <key>CFBundleDisplayName</key>
    <string>SimpleFocus</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSMinimumSystemVersion</key>
    <string>14.0</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSHumanReadableCopyright</key>
    <string></string>
</dict>
</plist>
PLIST

# Ad-hoc signature so Gatekeeper lets it run locally.
codesign --force --sign - "${APP_DIR}"

echo "✓ done: ${APP_DIR}"
echo "  запуск: open ${APP_DIR}"
