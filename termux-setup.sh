#!/data/data/com.termux/files/usr/bin/bash
# Termux one-time setup:  bash termux-setup.sh
set -e
pkg update -y && pkg upgrade -y
pkg install -y nodejs git python make clang binutils pkg-config unzip termux-api
export GYP_DEFINES="android_ndk_path=''"
cd "$(dirname "$0")"
npm install --omit=dev --no-audit --no-fund
echo ""
echo "✅ Done. Start the bot with:  ./start.sh bg"
echo "   Tip: Android Settings -> Battery -> Termux -> Unrestricted (so it is not killed)"
