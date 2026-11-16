/**
 * ============================================================================
 * ALIYA OFFICIAL V4 - UNIVERSAL LAUNCHER & MASTER SUPERVISOR
 * Maintained by Mr.king | Supports Render, Railway, Replit, Termux, Linux, VPS, Vercel
 * Features:
 *  - Instant Public Port Health & Live Restarting Website Page
 *  - Master-to-Wolf Fallback: If Aliya.js fails fatally or repeatedly, switches to Wolf.js
 *  - Auto-Dependency Installer & Multi-Account Pre-flight Check
 * ============================================================================
 */
"use strict";

const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PRIMARY_BOT_FILE = "Aliya.js";
const FALLBACK_BOT_FILE = "Wolf.js";
const ROOT = __dirname;
const REQUESTED_PORT = Number(process.env.PORT) || 8080;
let useProxy = process.env.ALIYA_NO_PROXY !== "1";

const QUICK_RESTART_MS = 1500;
const BASE_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 180000;
const STABLE_AFTER_MS = 90000;
const MAX_PRIMARY_FAILS_BEFORE_WOLF = 3;

let child = null;
let childStartedAt = 0;
let botPort = null;
let publicPort = REQUESTED_PORT;
let publicServer = null;
let shuttingDown = false;
let starting = false;
let restartTimer = null;
let launchCount = 0;
let failStreak = 0;
let activeCore = PRIMARY_BOT_FILE;
let serverOfflineMode = false;

function now() {
	return new Date().toTimeString().split(" ")[0];
}

function log(symbol, tag, msg) {
	console.log(`[${now()}] ${symbol} [${tag}] ──► ${msg}`);
}

function formatUptime(sec) {
	const d = Math.floor(sec / 86400);
	const h = Math.floor((sec % 86400) / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = Math.floor(sec % 60);
	return `${d}d ${h}h ${m}m ${s}s`;
}

function isChildRunning() {
	return child !== null && child.exitCode === null && !child.killed;
}

function getFreePort() {
	return new Promise((resolve, reject) => {
		const tester = net.createServer();
		tester.once("error", reject);
		tester.listen(0, "127.0.0.1", () => {
			const port = tester.address().port;
			tester.close(() => resolve(port));
		});
	});
}

function detectMemLimitMB() {
	let limit = os.totalmem();
	for (const file of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
		try {
			const value = Number(fs.readFileSync(file, "utf8").trim());
			if (Number.isFinite(value) && value > 0 && value < limit) limit = value;
		} catch (e) {}
	}
	return Math.floor(limit / 1048576);
}

const HEAP_MB = Number(process.env.ALIYA_MAX_MEM_MB)
	|| Math.min(4096, Math.max(256, Math.floor(detectMemLimitMB() * 0.65)));

function prepareFiles() {
	const accFiles = ["account.txt", "account2.txt", "account3.txt", "account4.txt", "account5.txt"];
	accFiles.forEach((f, idx) => {
		const fullPath = path.join(ROOT, f);
		if (!fs.existsSync(fullPath)) {
			const envKey = idx === 0 ? "ACCOUNT_TXT" : `ACCOUNT${idx + 1}_TXT`;
			const envVal = process.env[envKey] || "";
			try {
				fs.writeFileSync(fullPath, envVal);
			} catch (e) {}
		}
	});
}

function ensureDependencies() {
	if (fs.existsSync(path.join(ROOT, "node_modules", "express"))) return Promise.resolve();
	log("📦", "INSTALL", "Installing missing dependencies (first boot)...");
	return new Promise(resolve => {
		let installer;
		try {
			installer = spawn(
				process.platform === "win32" ? "npm.cmd" : "npm",
				["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"],
				{ cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" }
			);
		} catch (e) {
			log("❌", "INSTALL", `Could not run npm: ${e.message}`);
			return resolve();
		}
		installer.on("error", () => resolve());
		installer.on("exit", () => resolve());
	});
}

function sendStatusPage(req, res) {
	const isPage = (req.method === "GET" || req.method === "HEAD") && (req.url === "/" || req.url.startsWith("/?"));
	if (isPage) {
		const title = serverOfflineMode ? "Aliya Bot - Offline / All Accounts Failed" : "Aliya Bot - Restarting / Initializing";
		const heading = serverOfflineMode ? "⚠️ SERVER OFFLINE (ALL 5 ACCOUNTS FAILED)" : "👑 ALIYA V4 ULTRA — RESTARTING CORE";
		const desc = serverOfflineMode
			? "All 5 accounts in the pool (account.txt to account5.txt) failed authentication or are suspended. Update account files to auto-resume."
			: `Active Engine: ${activeCore} | Server is automatically restarting and initializing systems...`;

		res.writeHead(serverOfflineMode ? 503 : 200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Refresh": "6" });
		res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 20% 20%,#240046,#10002b 50%,#000);font-family:system-ui,sans-serif;color:#fff;text-align:center;padding:20px}.box{max-width:480px;padding:30px;border-radius:20px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.15)}h1{font-size:22px;background:linear-gradient(90deg,#f72585,#b5179e,#4cc9f0);-webkit-background-clip:text;color:transparent}p{opacity:0.85;line-height:1.5;font-size:14px}</style></head>
<body><div class="box"><h1>${heading}</h1><p>${desc}</p><p style="font-size:12px;opacity:0.6">Auto-refreshing every 6 seconds...</p></div></body></html>`);
		return;
	}
	res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "5" });
	res.end(JSON.stringify({ status: serverOfflineMode ? "offline_all_accounts_failed" : "restarting", core: activeCore }));
}

function handleHealth(res) {
	res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
	res.end(JSON.stringify({
		status: serverOfflineMode ? "offline" : "ok",
		core: activeCore,
		bot: botPort ? "running" : "restarting",
		launches: launchCount,
		uptime: formatUptime(process.uptime()),
		memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
	}));
}

function proxyHttp(req, res) {
	if (!botPort || serverOfflineMode) return sendStatusPage(req, res);
	const upstream = http.request(
		{ host: "127.0.0.1", port: botPort, method: req.method, path: req.url, headers: req.headers },
		upstreamRes => {
			res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
			upstreamRes.pipe(res);
		}
	);
	upstream.on("error", () => {
		if (!res.headersSent) sendStatusPage(req, res);
		else res.destroy();
	});
	res.on("close", () => { if (!res.writableEnded) upstream.destroy(); });
	req.pipe(upstream);
}

function proxyUpgrade(req, socket, head) {
	if (!botPort || serverOfflineMode) return socket.destroy();
	const upstream = net.connect(botPort, "127.0.0.1", () => {
		let raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
		for (let i = 0; i < req.rawHeaders.length; i += 2)
			raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
		upstream.write(raw + "\r\n");
		if (head && head.length) upstream.write(head);
		socket.pipe(upstream).pipe(socket);
	});
	upstream.on("error", () => socket.destroy());
	socket.on("error", () => upstream.destroy());
}

function listenOn(server, port) {
	return new Promise((resolve, reject) => {
		const onError = err => reject(err);
		server.once("error", onError);
		server.listen(port, "0.0.0.0", () => {
			server.removeListener("error", onError);
			resolve(server.address().port);
		});
	});
}

async function openPublicServer() {
	publicServer = http.createServer((req, res) => {
		if (req.url === "/health" || req.url === "/healthz") return handleHealth(res);
		proxyHttp(req, res);
	});
	publicServer.on("upgrade", proxyUpgrade);
	publicServer.on("clientError", (err, socket) => socket.destroy());

	const candidates = [REQUESTED_PORT, REQUESTED_PORT + 1, REQUESTED_PORT + 2, 0];
	for (const port of candidates) {
		try {
			publicPort = await listenOn(publicServer, port);
			log("🌐", "SERVER", `Public gateway active on port ${publicPort} (Health: /health)`);
			return;
		} catch (err) {
			if (err.code !== "EADDRINUSE" && err.code !== "EACCES") throw err;
		}
	}
	throw new Error("No free port available");
}

async function startBot() {
	if (shuttingDown || starting || isChildRunning()) return;
	if (restartTimer) {
		clearTimeout(restartTimer);
		restartTimer = null;
	}

	starting = true;
	let privatePort;
	try {
		privatePort = useProxy ? await getFreePort() : publicPort;
	} catch (e) {
		starting = false;
		return scheduleRestart(BASE_BACKOFF_MS);
	}
	starting = false;
	if (shuttingDown) return;

	// Choose core: Switch to Wolf.js if Aliya.js hit repeated critical failures or if explicitly requested
	if (!fs.existsSync(path.join(ROOT, activeCore))) {
		activeCore = fs.existsSync(path.join(ROOT, FALLBACK_BOT_FILE)) ? FALLBACK_BOT_FILE : PRIMARY_BOT_FILE;
	}

	launchCount++;
	log("🚀", "SPAWN", `Launching [${activeCore}] | Launch #${launchCount} | Heap: ${HEAP_MB}MB`);

	try {
		child = spawn(process.execPath, [`--max-old-space-size=${HEAP_MB}`, activeCore], {
			cwd: ROOT,
			stdio: ["inherit", "inherit", "inherit", "ipc"],
			shell: false,
			env: {
				NODE_NO_WARNINGS: "1",
				...process.env,
				PORT: String(privatePort),
				ALIYA_PUBLIC_PORT: String(publicPort),
				ALIYA_ACTIVE_CORE: activeCore
			}
		});
	} catch (error) {
		child = null;
		log("❌", "SPAWN_FAIL", `Failed to start ${activeCore}: ${error.message}`);
		return scheduleRestart(BASE_BACKOFF_MS);
	}

	childStartedAt = Date.now();
	if (useProxy) botPort = privatePort;
	serverOfflineMode = false;

	child.on("message", (msg) => {
		if (msg && msg.type === "ALL_ACCOUNTS_FAILED") {
			serverOfflineMode = true;
			botPort = null;
			log("🛑", "OFFLINE", "All 5 accounts failed login! Website switched to Restarting/Offline mode.");
		} else if (msg && msg.type === "SWITCH_TO_WOLF") {
			log("🐺", "FAILOVER", "Master requested immediate failover to Wolf.js!");
			activeCore = FALLBACK_BOT_FILE;
		} else if (msg && msg.type === "LOGIN_SUCCESS") {
			serverOfflineMode = false;
			failStreak = 0;
			log("✅", "ONLINE", `Core [${activeCore}] online using account: ${msg.account}`);
		}
	});

	child.on("error", error => log("❌", "PROCESS_ERR", `Error in ${activeCore}: ${error.message}`));

	child.on("exit", (code, signal) => {
		const ranMs = Date.now() - childStartedAt;
		child = null;
		botPort = null;
		log("💀", "EXIT", `[${activeCore}] stopped | Code: ${code} | Signal: ${signal} | Uptime: ${formatUptime(ranMs / 1000)}`);
		if (shuttingDown) return;

		// Exit code 3 = All 5 accounts failed or suspended -> stay in offline mode and retry slowly
		if (code === 3) {
			serverOfflineMode = true;
			log("⚠️", "ACCOUNT_POOL", "All 5 accounts unavailable. Retrying account pool in 60s...");
			return scheduleRestart(60000);
		}

		// Exit code 4 = Explicit failover request to Wolf.js
		if (code === 4) {
			activeCore = FALLBACK_BOT_FILE;
			failStreak = 0;
			log("🐺", "WOLF_MODE", "Switching execution core from Aliya.js to Wolf.js!");
			return scheduleRestart(QUICK_RESTART_MS);
		}

		// Exit code 2 = Planned hot restart (e.g. account switch command)
		if (code === 2) {
			failStreak = 0;
			return scheduleRestart(QUICK_RESTART_MS);
		}

		failStreak = ranMs >= STABLE_AFTER_MS ? 1 : failStreak + 1;

		// Master-to-Wolf automatic failover after repeated critical crashes
		if (activeCore === PRIMARY_BOT_FILE && failStreak >= MAX_PRIMARY_FAILS_BEFORE_WOLF && fs.existsSync(path.join(ROOT, FALLBACK_BOT_FILE))) {
			log("🐺", "CRITICAL_FAILOVER", `${PRIMARY_BOT_FILE} crashed ${failStreak} times! Switching over to ${FALLBACK_BOT_FILE} supreme backup core...`);
			activeCore = FALLBACK_BOT_FILE;
			failStreak = 0;
			return scheduleRestart(QUICK_RESTART_MS);
		}

		const delay = ranMs >= STABLE_AFTER_MS
			? QUICK_RESTART_MS
			: Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * Math.pow(2, failStreak - 1));
		scheduleRestart(delay);
	});
}

function scheduleRestart(delay) {
	if (shuttingDown || restartTimer) return;
	log("🛡️", "AUTO_HEAL", `Restarting [${activeCore}] in ${Math.round(delay / 1000)}s...`);
	restartTimer = setTimeout(() => {
		restartTimer = null;
		startBot();
	}, delay);
}

setInterval(() => {
	if (!shuttingDown && !isChildRunning() && !restartTimer && !starting) {
		log("⚠️", "WATCHDOG", "Process inactive! Triggering auto-recovery...");
		startBot();
	}
}, 10000);

function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	if (restartTimer) clearTimeout(restartTimer);
	if (publicServer) try { publicServer.close(); } catch (e) {}
	if (isChildRunning()) {
		try { child.kill("SIGTERM"); } catch (e) {}
		setTimeout(() => process.exit(0), 2500);
	} else process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", err => log("❌", "SUPERVISOR_ERR", err && err.message));
process.on("unhandledRejection", err => log("⚠️", "SUPERVISOR_REJ", err && err.message ? err.message : String(err)));

(async () => {
	log("🧩", "BOOT", `Node ${process.version} | ${process.platform}/${process.arch}`);
	prepareFiles();
	if (useProxy) {
		try {
			await openPublicServer();
		} catch (err) {
			useProxy = false;
			publicPort = REQUESTED_PORT;
		}
	}
	await ensureDependencies();
	startBot();
})();
		
