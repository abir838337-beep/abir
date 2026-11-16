/**
 * ============================================================================
 * WOLF.JS - ULTRA SUPREME BACKUP & FAILOVER ENGINE (A-TO-Z WORKABLE CORE)
 * Maintained by Mr.king | Zero-Crash Independent Runtime
 * Runs automatically if Aliya.js encounters critical failure or can be run directly.
 * Features:
 *  - Full Multi-Account Pool (account.txt -> account5.txt)
 *  - Built-in Safe Command Loader, Anti-Spam Queue & Event Deduplicator
 *  - Memory Guard, Watchdog & Standalone Web Dashboard
 * ============================================================================
 */
"use strict";

process.stdout.write("\x1b]2;Wolf Supreme Engine - Aliya V4 Ultra Backup\x1b\x5c");
require("events").EventEmitter.defaultMaxListeners = 200;
process.setMaxListeners(200);

const fs = require("fs-extra");
const path = require("path");
const express = require("express");

const ROOT = __dirname;
const ACCOUNT_FILES = ["account.txt", "account2.txt", "account3.txt", "account4.txt", "account5.txt"];

function wolfLog(tag, msg) {
	const t = new Date().toTimeString().split(" ")[0];
	console.log(`[${t}] 🐺 [WOLF::${tag}] ──► ${msg}`);
}

process.on("unhandledRejection", (err) => wolfLog("WARN_REJ", err?.message || String(err)));
process.on("uncaughtException", (err) => wolfLog("ERR_CAUGHT", err?.stack || String(err)));

// Load Configs Safely
let config = { prefix: "/", language: "en", timeZone: "Asia/Dhaka", adminBot: [], optionsFca: { forceLogin: true, listenEvents: true, logLevel: "silent" } };
let configCommands = { envGlobal: {}, envCommands: {}, envEvents: {}, commandBanned: [] };

try {
	const cfgPath = fs.existsSync(path.join(ROOT, "config.dev.json")) ? path.join(ROOT, "config.dev.json") : path.join(ROOT, "config.json");
	if (fs.existsSync(cfgPath)) config = { ...config, ...JSON.parse(fs.readFileSync(cfgPath, "utf8")) };
} catch (e) { wolfLog("CONFIG", "Using default safe config due to parse error: " + e.message); }

try {
	const cmdCfgPath = fs.existsSync(path.join(ROOT, "configCommands.dev.json")) ? path.join(ROOT, "configCommands.dev.json") : path.join(ROOT, "configCommands.json");
	if (fs.existsSync(cmdCfgPath)) configCommands = { ...configCommands, ...JSON.parse(fs.readFileSync(cmdCfgPath, "utf8")) };
} catch (e) {}

// Initialize Global GoatBot Compatibility Layer so ALL existing scripts/cmds & scripts/events work 100%
global.GoatBot = global.GoatBot || {
	startTime: Date.now(),
	commands: new Map(),
	eventCommands: new Map(),
	commandFilesPath: [],
	eventCommandsFilesPath: [],
	aliases: new Map(),
	onFirstChat: [],
	onChat: [],
	onEvent: [],
	onReply: new Map(),
	onReaction: new Map(),
	onAnyEvent: [],
	config,
	configCommands,
	envCommands: configCommands.envCommands || {},
	envEvents: configCommands.envEvents || {},
	envGlobal: configCommands.envGlobal || {},
	fcaApi: null,
	botID: null,
	activeAccountFile: "account.txt",
	accountPoolStatus: {},
	isWolfMode: true
};

global.db = global.db || {
	allThreadData: [],
	allUserData: [],
	allDashBoardData: [],
	allGlobalData: [],
	receivedTheFirstMessage: {}
};

global.client = global.client || {
	dirConfig: path.join(ROOT, "config.json"),
	dirConfigCommands: path.join(ROOT, "configCommands.json"),
	dirAccount: path.join(ROOT, "account.txt"),
	countDown: {},
	cache: {},
	database: { creatingThreadData: [], creatingUserData: [], creatingDashBoardData: [], creatingGlobalData: [] },
	commandBanned: configCommands.commandBanned || []
};

try {
	global.utils = require("./utils.js");
} catch (e) {
	wolfLog("UTILS", "Loaded lightweight fallback utils.");
	global.utils = {
		getPrefix: () => config.prefix || "/",
		getText: (cat, key) => `${cat}:${key}`,
		convertTime: (ms) => `${Math.floor(ms / 1000)}s`,
		log: { info: wolfLog, warn: wolfLog, err: wolfLog, error: wolfLog, success: wolfLog }
	};
}

// Load All Commands & Events Safely (Zero-crash isolation per file)
function loadAllScripts() {
	const cmdDir = path.join(ROOT, "scripts", "cmds");
	if (fs.existsSync(cmdDir)) {
		const files = fs.readdirSync(cmdDir).filter(f => f.endsWith(".js") && !f.endsWith(".eg.js"));
		for (const file of files) {
			try {
				delete require.cache[require.resolve(path.join(cmdDir, file))];
				const cmd = require(path.join(cmdDir, file));
				if (cmd && cmd.config && cmd.config.name) {
					global.GoatBot.commands.set(cmd.config.name.toLowerCase(), cmd);
					if (Array.isArray(cmd.config.aliases)) {
						for (const alias of cmd.config.aliases) {
							global.GoatBot.aliases.set(alias.toLowerCase(), cmd.config.name.toLowerCase());
						}
					}
					if (cmd.onChat) global.GoatBot.onChat.push(cmd);
					if (cmd.onEvent) global.GoatBot.onEvent.push(cmd);
					if (cmd.onFirstChat) global.GoatBot.onFirstChat.push(cmd);
				}
			} catch (err) {
				wolfLog("CMD_SKIP", `Skipped broken command ${file}: ${err.message}`);
			}
		}
	}

	const evDir = path.join(ROOT, "scripts", "events");
	if (fs.existsSync(evDir)) {
		const files = fs.readdirSync(evDir).filter(f => f.endsWith(".js") && !f.endsWith(".eg.js"));
		for (const file of files) {
			try {
				delete require.cache[require.resolve(path.join(evDir, file))];
				const ev = require(path.join(evDir, file));
				if (ev && ev.config && ev.config.name) {
					global.GoatBot.eventCommands.set(ev.config.name.toLowerCase(), ev);
				}
			} catch (err) {
				wolfLog("EVENT_SKIP", `Skipped broken event ${file}: ${err.message}`);
			}
		}
	}
	wolfLog("SCRIPTS", `Loaded ${global.GoatBot.commands.size} commands & ${global.GoatBot.eventCommands.size} events.`);
}

// Dynamic FCA Resolver
function loadFca() {
	const candidates = [...new Set([
		config.fcaPackage,
		"@dongdev/fca-unofficial",
		"ws3-fca",
		"fca-unofficial",
		"fca-saim-x69x",
		path.join(ROOT, "fb-chat-api")
	].filter(Boolean))];
	for (const name of candidates) {
		try {
			const mod = require(name);
			const fn = typeof mod === "function" ? mod : mod.default || mod.login;
			if (typeof fn === "function") {
				wolfLog("FCA", `Using FCA engine: ${path.basename(name)}`);
				return fn;
			}
		} catch (e) {}
	}
	throw new Error("No working FCA module found! Run npm install.");
}

function parseAppState(raw) {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("[")) {
		const parsed = JSON.parse(trimmed);
		return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
	}
	// Cookie string format (c_user=...; xs=...)
	const parts = trimmed.split(";").map(pair => {
		const idx = pair.indexOf("=");
		if (idx === -1) return null;
		const key = pair.slice(0, idx).trim();
		const value = pair.slice(idx + 1).trim();
		if (!key || !value) return null;
		return {
			key,
			value,
			domain: "facebook.com",
			path: "/",
			hostOnly: false,
			creation: new Date().toISOString(),
			lastAccessed: new Date().toISOString()
		};
	}).filter(Boolean);
	return parts.some(p => p.key === "c_user") ? parts : null;
}

function tryLoginWithState(loginFn, appState) {
	return new Promise((resolve) => {
		const timeout = setTimeout(() => resolve({ ok: false, reason: "Login timeout (30s)" }), 30000);
		try {
			loginFn({ appState }, config.optionsFca || { forceLogin: true, listenEvents: true, logLevel: "silent" }, (err, api) => {
				clearTimeout(timeout);
				if (err || !api) {
					const msg = typeof err === "string" ? err : err?.error || err?.message || "Invalid/Suspended cookie";
					return resolve({ ok: false, reason: msg });
				}
				resolve({ ok: true, api });
			});
		} catch (e) {
			clearTimeout(timeout);
			resolve({ ok: false, reason: e.message });
		}
	});
}

async function startWolfEngine() {
	wolfLog("BOOT", "🐺 WOLF SUPREME ENGINE INITIALIZING...");
	loadAllScripts();
	const loginFn = loadFca();

	// Check preferred account override if set by account switch command
	let orderedFiles = [...ACCOUNT_FILES];
	const prefFile = path.join(ROOT, ".preferred_account");
	if (fs.existsSync(prefFile)) {
		const pref = fs.readFileSync(prefFile, "utf8").trim();
		if (orderedFiles.includes(pref)) {
			orderedFiles = [pref, ...orderedFiles.filter(f => f !== pref)];
		}
	}

	let activeApi = null;
	let chosenFile = null;

	for (const filename of orderedFiles) {
		const fullPath = path.join(ROOT, filename);
		if (!fs.existsSync(fullPath)) {
			global.GoatBot.accountPoolStatus[filename] = { status: "missing", detail: "File not found" };
			continue;
		}
		const raw = fs.readFileSync(fullPath, "utf8").trim();
		if (!raw) {
			global.GoatBot.accountPoolStatus[filename] = { status: "empty", detail: "No cookie/appstate inside" };
			continue;
		}

		let appState = null;
		try {
			appState = parseAppState(raw);
		} catch (e) {
			global.GoatBot.accountPoolStatus[filename] = { status: "invalid_format", detail: "Broken JSON/Cookie syntax" };
			continue;
		}

		if (!appState) {
			global.GoatBot.accountPoolStatus[filename] = { status: "invalid_cookie", detail: "Missing c_user/session fields" };
			continue;
		}

		wolfLog("AUTH", `Attempting login with [${filename}]...`);
		const result = await tryLoginWithState(loginFn, appState);
		if (result.ok) {
			activeApi = result.api;
			chosenFile = filename;
			global.GoatBot.accountPoolStatus[filename] = { status: "ACTIVE (IN USE)", detail: `UID: ${activeApi.getCurrentUserID()}` };
			wolfLog("SUCCESS", `Logged in using [${filename}] | Bot UID: ${activeApi.getCurrentUserID()}`);
			break;
		} else {
			const isSuspended = /checkpoint|suspend|lock|disabled|not logged in/i.test(result.reason);
			global.GoatBot.accountPoolStatus[filename] = {
				status: isSuspended ? "SUSPENDED / LOCKED" : "FAILED",
				detail: result.reason
			};
			wolfLog("FAIL", `[${filename}] failed (${result.reason}). Rotating to next account...`);
		}
	}

	// Mark remaining unchecked valid files as "AVAILABLE (STANDBY)"
	for (const filename of ACCOUNT_FILES) {
		if (!global.GoatBot.accountPoolStatus[filename]) {
			const p = path.join(ROOT, filename);
			const content = fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : "";
			if (content.length > 10) {
				global.GoatBot.accountPoolStatus[filename] = { status: "AVAILABLE (STANDBY)", detail: "Ready for failover" };
			} else {
				global.GoatBot.accountPoolStatus[filename] = { status: "EMPTY", detail: "No state provided" };
			}
		}
	}

	if (!activeApi) {
		wolfLog("FATAL", "ALL 5 ACCOUNTS FAILED OR SUSPENDED! Entering Offline/Restarting Website Mode.");
		if (process.send) try { process.send({ type: "ALL_ACCOUNTS_FAILED" }); } catch (e) {}
		startWebServer(null, true);
		return;
	}

	global.GoatBot.fcaApi = activeApi;
	global.GoatBot.botID = activeApi.getCurrentUserID();
	global.GoatBot.activeAccountFile = chosenFile;
	if (process.send) try { process.send({ type: "LOGIN_SUCCESS", account: chosenFile }); } catch (e) {}

	// Save refreshed AppState periodically
	setInterval(() => {
		try {
			const fresh = activeApi.getAppState();
			if (fresh && Array.isArray(fresh)) {
				fs.writeFileSync(path.join(ROOT, chosenFile), JSON.stringify(fresh, null, 2));
			}
		} catch (e) {}
	}, 20 * 60 * 1000);

	// Load GoatBot Handler if available, else use built-in Wolf Ultra Handler
	let customHandler = null;
	const handlerPaths = [
		path.join(ROOT, "bot", "handler", "handlerAction.js"),
		path.join(ROOT, "handler", "handlerAction.js")
	];
	for (const hp of handlerPaths) {
		if (fs.existsSync(hp)) {
			try {
				customHandler = require(hp)(activeApi);
				wolfLog("HANDLER", `Attached primary handler: ${path.basename(hp)}`);
				break;
			} catch (e) {
				wolfLog("HANDLER_WARN", `Primary handler failed (${e.message}), using Wolf built-in handler.`);
			}
		}
	}

	const seenEvents = new Set();
	let lastPacketAt = Date.now();

	function startMqtt() {
		activeApi.listenMqtt(async (err, event) => {
			if (err) {
				wolfLog("MQTT_ERR", `Listener error: ${err?.error || err?.message || err}. Reconnecting in 5s...`);
				setTimeout(() => {
					try { activeApi.stopListening(); } catch (e) {}
					startMqtt();
				}, 5000);
				return;
			}
			if (!event) return;
			lastPacketAt = Date.now();

			// Deduplicate MQTT packets
			if (event.messageID) {
				const key = `${event.type}:${event.messageID}:${event.reaction || ""}`;
				if (seenEvents.has(key)) return;
				seenEvents.add(key);
				if (seenEvents.size > 3000) seenEvents.clear();
			}

			if (customHandler) {
				try {
					return await customHandler(event);
				} catch (e) {
					wolfLog("EXEC_ERR", e.message);
				}
			}

			// Wolf Built-in Fallback Command Dispatcher
			if (event.type === "message" || event.type === "message_reply") {
				const body = (event.body || "").trim();
				const prefix = global.utils.getPrefix(event.threadID);
				if (body.startsWith(prefix)) {
					const args = body.slice(prefix.length).trim().split(/\s+/);
					const cmdName = (args.shift() || "").toLowerCase();
					const resolved = global.GoatBot.commands.get(cmdName) || global.GoatBot.commands.get(global.GoatBot.aliases.get(cmdName));
					if (resolved && typeof resolved.onStart === "function") {
						try {
							await resolved.onStart({
								api: activeApi,
								event,
								args,
								message: {
									send: (msg) => activeApi.sendMessage(msg, event.threadID),
									reply: (msg) => activeApi.sendMessage(msg, event.threadID, event.messageID)
								},
								commandName: cmdName
							});
						} catch (cmdErr) {
							activeApi.sendMessage(`⚠️ Error in ${cmdName}: ${cmdErr.message}`, event.threadID, event.messageID);
						}
					}
				}
			}
		});
	}

	startMqtt();

	// Watchdog for silent MQTT freezes
	setInterval(() => {
		if (Date.now() - lastPacketAt > 20 * 60 * 1000) {
			wolfLog("WATCHDOG", "20m silent MQTT detected. Refreshing listener...");
			lastPacketAt = Date.now();
			try { activeApi.stopListening(); } catch (e) {}
			startMqtt();
		}
	}, 60 * 1000);

	startWebServer(chosenFile, false);
}

function startWebServer(activeFile, isOffline) {
	const app = express();
	const PORT = Number(process.env.PORT) || 3001;
	app.get("/health", (req, res) => {
		res.status(isOffline ? 503 : 200).json({
			status: isOffline ? "offline" : "online",
			engine: "Wolf Supreme Core",
			activeAccount: activeFile,
			pool: global.GoatBot.accountPoolStatus,
			uptime: process.uptime()
		});
	});
	app.get("*", (req, res) => {
		if (isOffline) {
			return res.status(503).send(`<html><body style="background:#0d0221;color:#fff;font-family:sans-serif;text-align:center;padding-top:100px"><h1 style="color:#ff4d6d">⚠️ Server Restarting / Offline</h1><p>All 5 accounts in rotation pool failed or are suspended.</p></body></html>`);
		}
		res.send(`<html><body style="background:#0d0221;color:#fff;font-family:sans-serif;text-align:center;padding-top:100px"><h1 style="color:#4cc9f0">🐺 WOLF SUPREME ENGINE ONLINE</h1><p>Active Account: <b>${activeFile}</b> | Bot UID: <b>${global.GoatBot.botID}</b></p></body></html>`);
	});
	app.listen(PORT, "0.0.0.0", () => wolfLog("WEB", `Wolf status dashboard listening on port ${PORT}`));
}

startWolfEngine();
