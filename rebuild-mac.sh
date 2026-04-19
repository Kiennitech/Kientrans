#!/bin/bash

# 1. Clean everything
echo "🧹 Cleaning everything..."
rm -rf release
rm -rf dist
# We don't remove node_modules again to save time, but we rebuild
# rm -rf node_modules 

# 2. Rebuild native modules for Electron
echo "🏗 Rebuilding native modules..."
npm run native:electron

# 3. Build Client
echo "📦 Building client..."
npm run build

# 4. Build Electron App
echo "🛠 Building Electron App..."
npx electron-builder --config electron-builder.config.js --mac

# New App Path based on the new ProductName
APP_PATH="release/mac-arm64/Hakien Trans AI.app"

# 5. AGGRESSIVE MANUAL SIGNING
echo "🖋 Performing Layered Ad-hoc Signing..."

# Sign every .node file individually first
find "$APP_PATH" -name "*.node" -exec codesign --force --sign - {} \;

# Sign the main binary
codesign --force --sign - "$APP_PATH/Contents/MacOS/Hakien Trans AI"

# Sign the whole app bundle
codesign --force --deep --sign - "$APP_PATH"

# 6. Fix macOS Quarantine
echo "🔓 Removing macOS quarantine flags..."
xattr -cr "$APP_PATH"

echo "✅ DONE! New App: Hakien Trans AI"
echo "👉 Open: $APP_PATH"
