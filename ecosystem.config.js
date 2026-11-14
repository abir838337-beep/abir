// VPS: pm2 start ecosystem.config.js && pm2 save && pm2 startup
module.exports = {
	apps: [{
		name: "aliya-v4",
		script: "index.js",
		autorestart: true,
		max_restarts: 100,
		min_uptime: "20s",
		restart_delay: 3000,
		kill_timeout: 8000,
		time: true
	}]
};
