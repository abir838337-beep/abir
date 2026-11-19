#!/data/data/com.termux/files/usr/bin/bash
# Termux one-time setup:  bash termux-setup.sh
# Safe for a fresh Termux install. Every message is in English.
set -e
cd "$(dirname "$0")"

echo "==> Updating Termux packages"
pkg update -y && pkg upgrade -y

echo "==> Installing Node.js, git and native build tools"
pkg install -y nodejs git python make clang binutils pkg-config unzip termux-api

echo "==> Installing optional image and database libraries"
# canvas is now @napi-rs/canvas: it ships a prebuilt Android binary and needs
# no cairo/pango build. These packages are kept for sharp and other modules;
# if a name is not available in your Termux mirror the install still continues.
pkg install -y cairo pango freetype fontconfig libpng libjpeg-turbo giflib librsvg harfbuzz libvips || true

# node-gyp on Android must not look for the Android NDK path.
export GYP_DEFINES="android_ndk_path=''"
export npm_config_python="$(command -v python)"
export npm_config_audit=false
export npm_config_fund=false

echo "==> Installing npm packages"
# A normal install is tried first. If a native module cannot be built for
# Android, retry with install scripts disabled; the native modules that are
# really needed are rebuilt one by one below. bcrypt is now pure JavaScript
# (bcryptjs), so it no longer needs a native build.
if ! npm install --omit=dev --no-audit --no-fund; then
  echo "Normal npm install failed, retrying without dependency install scripts..."
  npm install --omit=dev --no-audit --no-fund --ignore-scripts || true
fi

echo "==> Verifying canvas and rebuilding sqlite3 for Termux"
# canvas is installed as @napi-rs/canvas through the package.json alias. It has
# a prebuilt aarch64-linux-android binary, so no node-gyp compile is needed.
if [ -d node_modules/canvas ]; then
  if node -e "const {createCanvas}=require('canvas'); const c=createCanvas(4,4); if(c.width!==4) process.exit(1)" 2>/dev/null; then
    echo "canvas is ready and verified (prebuilt @napi-rs/canvas binary)."
  else
    echo "Warning: canvas could not be loaded. Reinstall it with:"
    echo "  npm install --no-audit --no-fund"
  fi
else
  echo "Warning: canvas folder is missing. Run: npm install --no-audit --no-fund"
fi

# sqlite3 has no prebuilt Android binary, so it must be compiled on the device.
# If compilation fails, Aliya detects the missing binding at startup and uses
# its built-in JSON database automatically; the bot still goes online.
if [ -d node_modules/sqlite3 ]; then
  npm_config_build_from_source=true npm rebuild sqlite3 --build-from-source --no-audit --no-fund || true
  if find node_modules/sqlite3 -name 'node_sqlite3.node' -print -quit 2>/dev/null | grep -q .; then
    echo "sqlite3 native binding is ready."
  else
    echo "Warning: sqlite3 native binding could not be built. Aliya will use the built-in JSON database."
    echo "To try again later: npm rebuild sqlite3 --build-from-source"
  fi
fi

# sharp uses prebuilt binaries. On Android the pure WebAssembly backend is the
# safest choice, so make sure it is present.
if [ -d node_modules/sharp ]; then
  npm install --no-save --no-audit --no-fund @img/sharp-wasm32 || true
fi

echo ""
echo "Setup finished. Start the bot with:  ./start.sh bg"
echo "Tip: Android Settings -> Battery -> Termux -> Unrestricted, so the bot is not killed."
