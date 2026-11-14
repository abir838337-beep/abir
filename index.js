/**
 * @author Mr.king x Aliya
 * Aliya Official V4 Engine - Universal Launcher
 *
 * Runs the same way on: Replit, Render, Railway, VPS, VS Code, Termux, Linux
 * (Vercel is serverless - a Messenger bot cannot stay online there.)
 *
 * What it does:
 *  1. Opens the public PORT in ~100ms, so Render/Railway/Replit health checks
 *     pass while the bot is still logging in.
 *  2. Starts Aliya.js on a private port and proxies the dashboard to it.
 *  3. Restarts the bot after ANY exit (exit code 0 included) with a smart
 *     back-off, so a network hiccup never switches the bot off for good.
 *  4. First boot: installs dependencies by itself if node_modules is missing.
 */

"use strict";

const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BOT_FILE = "Aliya.js";
const ROOT = __dirname;
const REQUESTED_PORT = Number(process.env.PORT) || 8080;
let useProxy = process.env.ALIYA_NO_PROXY !== "1"; // ALIYA_NO_PROXY=1 -> old behaviour (bot owns the port)
const QUICK_RESTART_MS = 1000;     // used when the bot asks for a restart (exit code 2)
const BASE_BACKOFF_MS = 2000;      // 2s, 4s, 8s ... after repeated quick crashes
const MAX_BACKOFF_MS = 300000;     // never wait more than 5 min (protects the FB account from login spam)
const STABLE_AFTER_MS = 120000;    // a run longer than 2 min resets the crash counter

const BANNER = `
  █████╗ ██╗     ██╗██╗   ██╗██████╗     ██╗   ██╗██╗  ██╗
 ██╔══██╗██║     ██║╚██╗ ██╔╝██╔══██╗    ██║   ██║██║  ██║
 ███████║██║     ██║ ╚████╔╝ ██████╔╝    ██║   ██║███████║
 ██╔══██║██║     ██║  ╚██╔╝  ██╔══██╗    ╚██╗ ██╔╝╚════██║
 ██║  ██║███████╗██║   ██║   ██║  ██║     ╚████╔╝      ██║
 ╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝   ╚═╝  ╚═╝      ╚═══╝       ╚═╝
`;

let child = null;
let childStartedAt = 0;
let botPort = null;          // private port of the running bot (null = not running)
let publicPort = REQUESTED_PORT;
let publicServer = null;
let shuttingDown = false;
let starting = false;
let restartTimer = null;
let launchCount = 0;
let failStreak = 0;

// ───────────────────────────── helpers ───────────────────────────── //

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
		} catch (e) { /* not a container / no cgroup */ }
	}
	return Math.floor(limit / 1048576);
}

// Heap cap = 60% of the real memory limit (Render free = 512MB, Termux phone, big VPS...).
// Node then runs GC harder instead of being OOM-killed. Override with ALIYA_MAX_MEM_MB.
const HEAP_MB = Number(process.env.ALIYA_MAX_MEM_MB)
	|| Math.min(4096, Math.max(192, Math.floor(detectMemLimitMB() * 0.6)));

// ─────────────────────── first-boot preparation ─────────────────────── //

function prepareFiles() {
	// account.txt = Facebook cookie. A missing file used to stop the bot silently.
	const accountFile = path.join(ROOT, "account.txt");
	const accountDevFile = path.join(ROOT, "account.dev.txt");
	try {
		const hasContent = f => fs.existsSync(f) && fs.readFileSync(f, "utf8").trim().length > 0;
		if (!hasContent(accountFile) && !hasContent(accountDevFile)) {
			// Cloud hosts: keep the cookie in an env var instead of a file
			let fromEnv = process.env.ACCOUNT_TXT || "";
			if (!fromEnv && process.env.ACCOUNT_TXT_B64)
				fromEnv = Buffer.from(process.env.ACCOUNT_TXT_B64, "base64").toString("utf8");
			if (fromEnv.trim()) {
				fs.writeFileSync(accountFile, fromEnv);
				log("🔑", "ACCOUNT", "account.txt created from environment variable.");
			}
			else if (!fs.existsSync(accountFile) && !fs.existsSync(accountDevFile)) {
				fs.writeFileSync(accountFile, "");
				log("⚠️", "ACCOUNT", "account.txt was missing - created an empty one. Add your fbstate/cookie or email+password in config.json.");
			}
		}
	}
	catch (e) {
		log("⚠️", "ACCOUNT", `Could not prepare account.txt: ${e.message}`);
	}
}

function ensureDependencies() {
	if (fs.existsSync(path.join(ROOT, "node_modules", "express"))) return Promise.resolve();
	log("📦", "INSTALL", "node_modules not found - installing dependencies (first boot only)...");
	return new Promise(resolve => {
		let installer;
		try {
			installer = spawn(
				process.platform === "win32" ? "npm.cmd" : "npm",
				["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"],
				{ cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" }
			);
		}
		catch (e) {
			log("❌", "INSTALL", `Could not run npm: ${e.message}. Run it manually: npm install`);
			return resolve();
		}
		const killer = setTimeout(() => { try { installer.kill("SIGKILL"); } catch (e) { /* ignore */ } }, 15 * 60 * 1000);
		installer.on("error", e => { clearTimeout(killer); log("❌", "INSTALL", `npm error: ${e.message}`); resolve(); });
		installer.on("exit", code => {
			clearTimeout(killer);
			if (code === 0) log("✅", "INSTALL", "Dependencies installed.");
			else log("❌", "INSTALL", `npm install failed (code ${code}). Run it manually: npm install`);
			resolve();
		});
	});
}

// ─────────────────── public server (health + proxy) ─────────────────── //

function sendStarting(req, res) {
	const isPage = (req.method === "GET" || req.method === "HEAD") && (req.url === "/" || req.url.startsWith("/?"));
	if (isPage) {
		res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Refresh": "5" });
		res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aliya Official v4</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 20% 20%,#3a0ca3,#10002b 45%,#000);font-family:system-ui,sans-serif;color:#fff;text-align:center}h1{background:linear-gradient(90deg,#f72585,#7209b7,#4cc9f0);-webkit-background-clip:text;background-clip:text;color:transparent}</style></head>
<body><div><h1>👑 ALIYA V4</h1><p>Bot is starting… this page refreshes by itself.</p></div></body></html>`);
		return;
	}
	res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "5" });
	res.end(JSON.stringify({ status: "starting" }));
}

function handleHealth(res) {
	res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
	res.end(JSON.stringify({
		status: "ok",
		bot: botPort ? "running" : "starting",
		launches: launchCount,
		uptime: formatUptime(process.uptime()),
		memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
	}));
}

function proxyHttp(req, res) {
	if (!botPort) return sendStarting(req, res);
	const upstream = http.request(
		{ host: "127.0.0.1", port: botPort, method: req.method, path: req.url, headers: req.headers },
		upstreamRes => {
			res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
			upstreamRes.pipe(res);
		}
	);
	upstream.on("error", () => {
		if (!res.headersSent) sendStarting(req, res);
		else res.destroy();
	});
	res.on("close", () => { if (!res.writableEnded) upstream.destroy(); });
	req.pipe(upstream);
}

function proxyUpgrade(req, socket, head) {
	if (!botPort) return socket.destroy();
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
	socket.on("close", () => upstream.destroy());
	upstream.on("close", () => socket.destroy());
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

	// Wanted port busy (e.g. 8080 already used on your PC)? Try the next ones, then any free port.
	const candidates = [REQUESTED_PORT, REQUESTED_PORT + 1, REQUESTED_PORT + 2, 0];
	for (const port of candidates) {
		try {
			publicPort = await listenOn(publicServer, port);
			if (port !== REQUESTED_PORT)
				log("⚠️", "PORT", `Port ${REQUESTED_PORT} is busy. Using port ${publicPort} instead.`);
			log("🌐", "SERVER", `Public port ${publicPort} is open (health: /health)`);
			return;
		}
		catch (err) {
			if (err.code !== "EADDRINUSE" && err.code !== "EACCES") throw err;
		}
	}
	throw new Error("No free port found");
}

// ───────────────────────────── bot process ───────────────────────────── //

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
	}
	catch (e) {
		starting = false;
		log("❌", "PORT_FAIL", e.message);
		return scheduleRestart(BASE_BACKOFF_MS);
	}
	starting = false;
	if (shuttingDown) return;

	launchCount++;
	console.log("\n" + BANNER);
	console.log(" ╔═══════════════════════════════════════════════════════════╗");
	console.log(" ║              👑 ALIYA OFFICIAL V4 ENGINE                  ║");
	console.log(" ║              👤 DEVELOPER : Mr.king                      ║");
	console.log(` ║              🔄 LAUNCH COUNT : ${String(launchCount).padEnd(25)} ║`);
	console.log(" ╚═══════════════════════════════════════════════════════════╝\n");

	try {
		child = spawn(process.execPath, [`--max-old-space-size=${HEAP_MB}`, BOT_FILE], {
			cwd: ROOT,
			stdio: "inherit",
			shell: false,
			env: {
				NODE_NO_WARNINGS: "1",
				...process.env,
				PORT: String(privatePort),
				ALIYA_PUBLIC_PORT: String(publicPort)
			}
		});
	}
	catch (error) {
		child = null;
		log("❌", "SPAWN_FAIL", `Failed to start ${BOT_FILE}: ${error.message}`);
		return scheduleRestart(BASE_BACKOFF_MS);
	}

	childStartedAt = Date.now();
	if (useProxy) botPort = privatePort;
	log("🚀", "SYSTEM", `Bot core spawned | PID: [ ${child.pid} ] | heap cap: ${HEAP_MB}MB`);

	child.on("error", error => log("❌", "PROCESS_ERR", `Error in ${BOT_FILE}: ${error.message}`));

	child.on("exit", (code, signal) => {
		const ranMs = Date.now() - childStartedAt;
		child = null;
		botPort = null;
		log("💀", "EXIT", `Stopped | Code: [ ${code} ] | Signal: [ ${signal} ] | Ran: ${formatUptime(ranMs / 1000)}`);
		if (shuttingDown) return;

		// Code 2 = the bot asked for a restart (auto-restart / new fbstate from dashboard)
		// (only when the run was healthy - a dead cookie must not cause a fast login loop on Facebook)
		if (code === 2 && ranMs >= 60000) {
			failStreak = 0;
			return scheduleRestart(QUICK_RESTART_MS);
		}

		failStreak = ranMs >= STABLE_AFTER_MS ? 1 : failStreak + 1;
		const delay = ranMs >= STABLE_AFTER_MS
			? QUICK_RESTART_MS
			: Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (failStreak - 1));
		log("⚠️", "AUTO_HEAL", `Bot ended (quick-crash streak: ${failStreak}). Server stays ON.`);
		scheduleRestart(delay);
	});
}

function scheduleRestart(delay) {
	if (shuttingDown || restartTimer) return;
	log("🛡️", "RECOVERY", `Re-booting in ${Math.round(delay / 1000)}s...`);
	restartTimer = setTimeout(() => {
		restartTimer = null;
		startBot();
	}, delay);
}

// Watchdog: if nothing is running and nothing is scheduled, start it.
setInterval(() => {
	if (!shuttingDown && !isChildRunning() && !restartTimer && !starting) {
		log("⚠️", "WATCHDOG", "Bot is inactive! Forcing start...");
		startBot();
	}
}, 10000);

// ───────────────────────────── shutdown ───────────────────────────── //

function shutdown(signal) {
	if (shuttingDown) return;
	shuttingDown = true;
	log("⚠️", "SHUTDOWN", `${signal} received. Cleaning up...`);
	if (restartTimer) clearTimeout(restartTimer);
	if (publicServer) try { publicServer.close(); } catch (e) { /* ignore */ }

	if (isChildRunning()) {
		try { child.kill("SIGTERM"); } catch (e) { /* ignore */ }
		setTimeout(() => {
			try { if (child) child.kill("SIGKILL"); } catch (e) { /* ignore */ }
			process.exit(0);
		}, 3000);
		child.once("exit", () => process.exit(0));
	}
	else process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", err => log("❌", "UNCAUGHT", err && err.message));
process.on("unhandledRejection", err => log("⚠️", "UNHANDLED", err && err.message ? err.message : String(err)));
process.stdout.on("error", () => { /* EPIPE when the terminal closes */ });
process.stderr.on("error", () => { /* same */ });

// ───────────────────────────── go! ───────────────────────────── //

(async () => {
	log("🧩", "ENV", `Node ${process.version} | ${process.platform}/${process.arch}`);
	prepareFiles();
	if (useProxy) {
		try {
			await openPublicServer();
		}
		catch (err) {
			log("❌", "SERVER", `Could not open public server: ${err.message}. Falling back to bot-owned port.`);
			useProxy = false;
			publicServer = null;
			publicPort = REQUESTED_PORT;
		}
	}
	else publicPort = REQUESTED_PORT; // proxy off: the bot opens PORT itself (original behaviour)
	await ensureDependencies();
	startBot();
})();
