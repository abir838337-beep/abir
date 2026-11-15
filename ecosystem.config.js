// PM2 (VPS / Linux / Termux): npm run pm2   then   pm2 save && pm2 startup
module.exports = {
  apps: [{
    name: "aliya-bot",
    script: "index.js",
    autorestart: true,
    min_uptime: "30s",
    max_restarts: 1000,
    restart_delay: 5000,
    env: { NODE_ENV: "production" }
  }]
};
