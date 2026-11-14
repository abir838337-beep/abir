#!/usr/bin/env bash
# Aliya V4 - one start script for VPS, Linux, VS Code terminal and Termux
#   ./start.sh        run in this terminal
#   ./start.sh bg     run in background (nohup), log -> bot.log
#   ./start.sh pm2    run with pm2 (auto-start after reboot on a VPS)
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js not found. Install Node 20+ (Termux: pkg install nodejs)"; exit 1
fi
if [ "$(node -p "process.versions.node.split('.')[0]")" -lt 20 ]; then
  echo "❌ Node 20+ needed, you have $(node -v)"; exit 1
fi

# Termux: keep the CPU awake while the screen is off + help node-gyp
if [ -n "$TERMUX_VERSION" ] || [ -d /data/data/com.termux ]; then
  command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock
  export GYP_DEFINES="android_ndk_path=''"
fi

if [ ! -d node_modules/express ]; then
  echo "📦 Installing dependencies (first run)..."
  npm install --omit=dev --no-audit --no-fund || { echo "❌ npm install failed"; exit 1; }
fi

case "$1" in
  pm2)
    command -v pm2 >/dev/null 2>&1 || npm install -g pm2
    pm2 start ecosystem.config.js && pm2 save
    pm2 logs aliya-v4 ;;
  bg)
    nohup node index.js >> bot.log 2>&1 &
    echo "✅ Started in background (PID $!). Logs: tail -f bot.log" ;;
  *)
    exec node index.js ;;
esac
