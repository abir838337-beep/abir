// set bash title
process.stdout.write("\x1b]2;Aliya Official V4 - Ultra Hybrid Master (Maintained by Mr.king)\x1b\x5c");
const defaultRequire = require;

const gradient = defaultRequire("gradient-string");
const axios = defaultRequire("axios");
const path = defaultRequire("path");
const readline = defaultRequire("readline");
const fs = defaultRequire("fs-extra");
const toptp = defaultRequire("totp-generator");
const qr = new (defaultRequire("qrcode-reader"));

let Canvas = null;
try { Canvas = defaultRequire("canvas"); }
catch (e) { try { Canvas = defaultRequire("@napi-rs/canvas"); } catch (e2) {} }

// Dynamic FCA Loader (supports fb-chat-api, @dongdev/fca-unofficial, ws3-fca, etc.)
function getFcaLogin() {
	const candidates = [...new Set([
		global.GoatBot?.config?.fcaPackage,
		`${process.cwd()}/fb-chat-api`,
		"@dongdev/fca-unofficial",
		"ws3-fca",
		"fca-unofficial",
		"fca-saim-x69x"
	].filter(Boolean))];
	for (const pkg of candidates) {
		try {
			const mod = defaultRequire(pkg);
			const fn = typeof mod === "function" ? mod : mod.default || mod.login;
			if (typeof fn === "function") return fn;
		} catch (e) {}
	}
	throw new Error("No valid FCA package found!");
}
const login = getFcaLogin();

const ACCOUNT_FILES = ["account.txt", "account2.txt", "account3.txt", "account4.txt", "account5.txt"];

// Critical crash -> Immediate failover to Wolf.js
function triggerWolfFailover(err) {
	console.error("\n[CRITICAL LOGIN ERROR] Switching to Wolf.js backup engine:", err?.message || err);
	if (process.send) try { process.send({ type: "SWITCH_TO_WOLF" }); } catch (e) {}
	process.exit(4);
}
process.on("uncaughtException", triggerWolfFailover);

async function getUtcNow() {
	try {
		const res = await axios.get("http://worldtimeapi.org/api/timezone/UTC", { timeout: 8000 });
		return new Date(res.data.utc_datetime).getTime();
	} catch (e) { return Date.now(); }
}

async function getName(userID) {
	try {
		const user = await axios.post(`https://www.facebook.com/api/graphql/?q=${`node(${userID}){name}`}`, undefined, { timeout: 10000 });
		return user.data[userID].name;
	} catch (error) { return null; }
}

function compareVersion(version1, version2) {
	const v1 = version1.split(".");
	const v2 = version2.split(".");
	for (let i = 0; i < 3; i++) {
		if (parseInt(v1[i]) > parseInt(v2[i])) return 1;
		if (parseInt(v1[i]) < parseInt(v2[i])) return -1;
	}
	return 0;
}

const { writeFileSync, readFileSync, existsSync, watch } = require("fs-extra");
const handlerWhenListenHasError = require("./handlerWhenListenHasError.js");
const checkLiveCookie = require("./checkLiveCookie.js");
const { callbackListenTime, storage5Message } = global.GoatBot;
const { log, logColor, getPrefix, createOraDots, jsonStringifyColor, getText, convertTime, colors, randomString } = global.utils;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const currentVersion = require(`${process.cwd()}/package.json`).version;

function centerText(text, length) {
	const width = process.stdout.columns || 60;
	const leftPadding = Math.floor((width - (length || text.length)) / 2);
	const rightPadding = width - leftPadding - (length || text.length);
	console.log(' '.repeat(leftPadding > 0 ? leftPadding : 0) + text + ' '.repeat(rightPadding > 0 ? rightPadding : 0));
}

const titles = [
	[
		" █████╗ ██╗     ██╗██╗   ██╗ █████╗   ██╗   ██╗██╗  ██╗",
		"██╔══██╗██║     ██║╚██╗ ██╔╝██╔══██╗  ██║   ██║██║  ██║",
		"███████║██║     ██║ ╚████╔╝ ███████║  ██║   ██║███████║",
		"██╔══██║██║     ██║  ╚██╔╝  ██╔══██║  ╚██╗ ██╔╝╚════██║",
		"██║  ██║███████╗██║   ██║   ██║  ██║   ╚████╔╝      ██║",
		"╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝   ╚═╝  ╚═╝    ╚═══╝       ╚═╝"
	],
	["▄▀█ █░░ █ █▄█ ▄▀█  █░█ █░█", "█▀█ █▄▄ █ ░█░ █▀█  ▀▄▀ ▀▀█"],
	["A L I Y A  V 4 @" + currentVersion],
	["ALIYA V4"]
];
const maxWidth = process.stdout.columns || 60;
const title = maxWidth > 58 ? titles[0] : maxWidth > 36 ? titles[1] : maxWidth > 26 ? titles[2] : titles[3];

let widthConsole = process.stdout.columns || 50;
if (widthConsole > 50) widthConsole = 50;

function createLine(content, isMaxWidth = false) {
	if (!content) return Array(isMaxWidth ? (process.stdout.columns || 50) : widthConsole).fill("─").join("");
	content = ` ${content.trim()} `;
	const lengthLine = (isMaxWidth ? (process.stdout.columns || 50) : widthConsole) - content.length;
	let left = Math.floor(lengthLine / 2);
	if (left < 0 || isNaN(left)) left = 0;
	return Array(left).fill("─").join("") + content + Array(left).fill("─").join("");
}

console.log(gradient("#f5af19", "#f12711")(createLine(null, true)));
for (const text of title) centerText(gradient("#FA8BFF", "#2BD2FF", "#2BFF88")(text), text.length);
centerText(gradient("#9F98E8", "#AFF6CF")("Maintained by Mr.king | 5-Account Auto-Rotation Enabled"), 56);

const character = createLine();
const { facebookAccount } = global.GoatBot.config;

function responseUptimeSuccess(req, res) {
	res.type('json').send({
		status: "success",
		activeAccount: global.GoatBot.activeAccountFile,
		pool: global.GoatBot.accountPoolStatus,
		uptime: process.uptime(),
		unit: "seconds"
	});
}

function responseUptimeError(req, res) {
	res.status(503).type('json').send({
		status: "error",
		uptime: process.uptime(),
		statusAccountBot: global.statusAccountBot,
		pool: global.GoatBot.accountPoolStatus
	});
}
function filterKeysAppState(appState) {
	return appState.filter(item => ["c_user", "xs", "datr", "fr", "sb", "i_user"].includes(item.key));
}

global.responseUptimeCurrent = responseUptimeSuccess;
global.responseUptimeSuccess = responseUptimeSuccess;
global.responseUptimeError = responseUptimeError;
global.statusAccountBot = 'good';
let changeFbStateByCode = false;
let dashBoardIsRunning = false;

function isNetScapeCookie(cookie) {
	return typeof cookie === 'string' && /(.+)\t(1|TRUE|true)\t([\w\/.-]*)\t(1|TRUE|true)\t\d+\t([\w-]+)\t(.+)/i.test(cookie);
}

function netScapeToCookies(cookieData) {
	const cookies = [];
	cookieData.split('\n').forEach((line) => {
		if (line.trim().startsWith('#')) return;
		const fields = line.split('\t').map(f => f.trim()).filter(f => f.length > 0);
		if (fields.length < 7) return;
		cookies.push({
			key: fields[5],
			value: fields[6],
			domain: fields[0],
			path: fields[2],
			hostOnly: fields[1] === 'TRUE',
			creation: new Date(fields[4] * 1000).toISOString(),
			lastAccessed: new Date().toISOString()
		});
	});
	return cookies;
}

function pushI_user(appState, value) {
	if (!appState.some(c => c.key === "i_user")) {
		appState.push({
			key: "i_user",
			value: value || facebookAccount.i_user,
			domain: "facebook.com",
			path: "/",
			hostOnly: false,
			creation: new Date().toISOString(),
			lastAccessed: new Date().toISOString()
		});
	}
	return appState;
}

// Parse any account file (JSON AppState, Cookie String, Netscape, or Token)
async function parseAccountFile(filePath) {
	if (!existsSync(filePath)) return null;
	const accountText = readFileSync(filePath, "utf8").trim();
	if (!accountText) return null;

	let appState = [];
	if (accountText.startsWith('EAAAA')) {
		appState = await require('./getFbstate.js')(accountText);
	} else if (isNetScapeCookie(accountText)) {
		appState = netScapeToCookies(accountText);
	} else if (accountText.startsWith('[')) {
		appState = JSON.parse(accountText);
		if (appState.some(i => i.name)) {
			appState = appState.map(i => ({ ...i, key: i.name }));
		}
		appState = appState.map(item => ({
			...item,
			domain: "facebook.com",
			path: "/",
			hostOnly: false,
			creation: new Date().toISOString(),
			lastAccessed: new Date().toISOString()
		})).filter(i => i.key && i.value && i.key !== "x-referer");
	} else if (accountText.match(/^(?:\s*\w+\s*=\s*[^;]*;?)+/)) {
		appState = accountText.split(';').map(i => {
			const eq = i.indexOf('=');
			if (eq === -1) return null;
			return {
				key: i.slice(0, eq).trim(),
				value: i.slice(eq + 1).trim(),
				domain: "facebook.com",
				path: "/",
				hostOnly: true,
				creation: new Date().toISOString(),
				lastAccessed: new Date().toISOString()
			};
		}).filter(i => i && i.key && i.value && i.key !== "x-referer");
	} else {
		return null;
	}

	appState = filterKeysAppState(appState);
	if (!appState.some(c => c.key === "c_user")) return null;
	if (facebookAccount?.i_user) pushI_user(appState, facebookAccount.i_user);
	return appState;
}

function tryFcaLogin(appState) {
	return new Promise((resolve) => {
		const timer = setTimeout(() => resolve({ ok: false, error: "Login timeout (30s)" }), 30000);
		login({ appState }, global.GoatBot.config.optionsFca, (err, api) => {
			clearTimeout(timer);
			if (err || !api) {
				const reason = typeof err === "string" ? err : err?.error || err?.message || "Invalid/Expired cookie";
				return resolve({ ok: false, error: reason });
			}
			resolve({ ok: true, api });
		});
	});
}

function stopListening(keyListen) {
	keyListen = keyListen || Object.keys(callbackListenTime).pop();
	return new Promise((resolve) => {
		global.GoatBot.fcaApi?.stopListening?.(() => {
			if (callbackListenTime[keyListen]) callbackListenTime[keyListen] = () => {};
			resolve();
		}) || resolve();
	});
}

async function startBot() {
	console.log(colors.hex("#f5ab00")(createLine("MULTI-ACCOUNT LOGIN POOL", true)));
	const root = process.cwd();
	global.GoatBot.accountPoolStatus = {};

	// Check preferred account from /account switch command
	let orderedFiles = [...ACCOUNT_FILES];
	const prefPath = path.join(root, ".preferred_account");
	if (existsSync(prefPath)) {
		const pref = readFileSync(prefPath, "utf8").trim();
		if (orderedFiles.includes(pref)) {
			orderedFiles = [pref, ...orderedFiles.filter(f => f !== pref)];
		}
	}

	let api = null;
	let activeFile = null;
	let activeAppState = null;

	for (const filename of orderedFiles) {
		const fullPath = path.join(root, filename);
		if (!existsSync(fullPath) || !readFileSync(fullPath, "utf8").trim()) {
			global.GoatBot.accountPoolStatus[filename] = { status: "EMPTY", detail: "No cookie/appstate" };
			continue;
		}

		let parsedState = null;
		try {
			parsedState = await parseAccountFile(fullPath);
		} catch (e) {
			global.GoatBot.accountPoolStatus[filename] = { status: "INVALID_FORMAT", detail: e.message };
			continue;
		}

		if (!parsedState) {
			global.GoatBot.accountPoolStatus[filename] = { status: "INVALID_COOKIE", detail: "Missing c_user cookie" };
			continue;
		}

		log.info("ACCOUNT POOL", `Trying login with ${filename}...`);
		const result = await tryFcaLogin(parsedState);
		if (result.ok) {
			api = result.api;
			activeFile = filename;
			activeAppState = parsedState;
			global.GoatBot.accountPoolStatus[filename] = { status: "ACTIVE (IN USE)", detail: `UID: ${api.getCurrentUserID()}` };
			log.master("ACCOUNT POOL", `Connected via ${filename} (UID: ${api.getCurrentUserID()})`);
			break;
		} else {
			const isSuspended = /checkpoint|suspend|lock|disabled|not logged in|approval/i.test(result.error);
			global.GoatBot.accountPoolStatus[filename] = {
				status: isSuspended ? "SUSPENDED / LOCKED" : "FAILED",
				detail: result.error
			};
			log.warn("ACCOUNT POOL", `${filename} failed (${result.error}). Trying next account...`);
		}
	}

	// Mark remaining unchecked files as STANDBY
	for (const f of ACCOUNT_FILES) {
		if (!global.GoatBot.accountPoolStatus[f]) {
			const p = path.join(root, f);
			const hasData = existsSync(p) && readFileSync(p, "utf8").trim().length > 10;
			global.GoatBot.accountPoolStatus[f] = {
				status: hasData ? "AVAILABLE (STANDBY)" : "EMPTY",
				detail: hasData ? "Ready for failover" : "No cookie/appstate"
			};
		}
	}

	// Print status summary in console
	for (const f of ACCOUNT_FILES) {
		const st = global.GoatBot.accountPoolStatus[f];
		console.log(`  • ${f.padEnd(13)} => ${st.status} (${st.detail})`);
	}

	// If ALL 5 accounts fail -> Server goes into Offline / Restarting website display mode
	if (!api) {
		log.err("ACCOUNT POOL", "ALL 5 ACCOUNTS FAILED OR SUSPENDED! Entering Server Offline/Restarting mode...");
		global.statusAccountBot = "all_accounts_failed";
		global.responseUptimeCurrent = responseUptimeError;
		if (process.send) try { process.send({ type: "ALL_ACCOUNTS_FAILED" }); } catch (e) {}
		startUptimeServer(true);
		return;
	}

	global.GoatBot.fcaApi = api;
	global.GoatBot.botID = api.getCurrentUserID();
	global.GoatBot.activeAccountFile = activeFile;
	global.client.dirAccount = path.join(root, activeFile);
	if (process.send) try { process.send({ type: "LOGIN_SUCCESS", account: activeFile }); } catch (e) {}

	if (global.GoatBot.Listening) await stopListening();

	global.GoatBot.commands = new Map();
	global.GoatBot.eventCommands = new Map();
	global.GoatBot.aliases = new Map();
	global.GoatBot.onChat = [];
	global.GoatBot.onEvent = [];
	global.GoatBot.onReply = new Map();
	global.GoatBot.onReaction = new Map();
	clearInterval(global.intervalRestartListenMqtt);

	let hasBanned = false;
	global.botID = api.getCurrentUserID();
	logColor("#f5ab00", createLine("BOT INFO"));
	log.info("NODE VERSION", process.version);
	log.info("PROJECT VERSION", currentVersion);
	log.info("ACTIVE ACCOUNT", `${activeFile} (${global.botID} - ${await getName(global.botID)})`);
	log.info("PREFIX", global.GoatBot.config.prefix);
	log.info("LANGUAGE", global.GoatBot.config.language);

	// ———————————————————— GBAN CHECK ————————————————————— //
	let dataGban = {};
	try {
		const item = await axios.get("https://raw.githubusercontent.com/Savage-Army/gban/refs/heads/main/gban.json", { timeout: 15000 });
		dataGban = item.data || {};
		if (dataGban[global.botID] && (!dataGban[global.botID].toDate || (await getUtcNow()) < new Date(dataGban[global.botID].date).getTime())) {
			log.err('GBAN', getText('login', 'gbanMessage', dataGban[global.botID].date, dataGban[global.botID].reason));
			hasBanned = true;
		}
		if (hasBanned) process.exit(1);
	} catch (e) {
		log.warn('GBAN', getText('login', 'checkGbanError'));
	}

	// Auto-refresh active account fbstate
	if (global.GoatBot.config.autoRefreshFbstate == true) {
		changeFbStateByCode = true;
		try {
			writeFileSync(path.join(root, activeFile), JSON.stringify(filterKeysAppState(api.getAppState()), null, 2));
		} catch (err) {}
		setTimeout(() => changeFbStateByCode = false, 1000);
	}

	// ——————————————————— LOAD DATABASE & SCRIPTS (100% INTACT) ——————————————————— //
	const { threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData } =
		await require(process.env.NODE_ENV === 'development' ? "./loadData.dev.js" : "./loadData.js")(api, createLine);

	if (existsSync(path.join(__dirname, "../custom.js"))) {
		await require("../custom.js")({ api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, getText });
	}

	await require(process.env.NODE_ENV === 'development' ? "./loadScripts.dev.js" : "./loadScripts.js")(
		api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, createLine
	);

	// ——————————————————— DASHBOARD ——————————————————— //
	if (global.GoatBot.config.dashBoard?.enable == true && !dashBoardIsRunning) {
		try {
			await require("../../dashboard/app.js")(api);
			dashBoardIsRunning = true;
		} catch (err) {
			log.err("DASHBOARD", getText('login', 'openDashboardError'), err);
		}
	}

	log.master("SUCCESS", getText('login', 'runBot'));
	log.master("LOAD TIME", `${convertTime(Date.now() - global.GoatBot.startTime)}`);

	// ——————————— SELF-HEALING LISTENER + AUTO ACCOUNT FAILOVER ——————————— //
	let lastListenActivity = Date.now();
	let relistenTimer = null;
	const listenFailTimes = [];

	function recoverListener(reason) {
		if (relistenTimer) return;
		const nowMs = Date.now();
		listenFailTimes.push(nowMs);
		while (listenFailTimes.length && nowMs - listenFailTimes[0] > 10 * 60 * 1000) listenFailTimes.shift();
		if (listenFailTimes.length >= 4) {
			log.err("LISTEN_MQTT", "Listener keeps failing - restarting bot...");
			return process.exit(2);
		}
		const delay = 5000 * listenFailTimes.length;
		relistenTimer = setTimeout(async () => {
			relistenTimer = null;
			try {
				await stopListening();
				await sleep(1000);
				lastListenActivity = Date.now();
				global.GoatBot.Listening = api.listenMqtt(createCallBackListen());
			} catch (e) {
				process.exit(2);
			}
		}, delay);
	}

	async function callBackListen(error, event) {
		if (error) {
			global.responseUptimeCurrent = responseUptimeError;
			const errStr = String(error?.error || error?.message || error);
			// If current account gets suspended or logged out mid-session -> mark dead & auto-rotate to next account!
			if (/Not logged in|checkpoint|suspend|lock|disabled/i.test(errStr)) {
				log.err("SESSION_LOST", `${activeFile} logged out or suspended! Rotating to next account...`);
				try { writeFileSync(path.join(root, activeFile), ""); } catch (e) {}
				return process.exit(2);
			}
			if (error == "Connection closed." || error == "Connection closed by user.") return;
			await handlerWhenListenHasError({ api, threadModel, userModel, dashBoardModel, globalModel, threadsData, usersData, dashBoardData, globalData, error });
			recoverListener("MQTT error");
			return;
						}
		global.responseUptimeCurrent = responseUptimeSuccess;
		global.statusAccountBot = 'good';
		lastListenActivity = Date.now();

		// WhiteList Mode checks (preserved 100%)
		const wlUser = global.GoatBot.config.whiteListMode;
		const wlThread = global.GoatBot.config.whiteListModeThread;
		const isAdmin = global.GoatBot.config.adminBot.includes(event.senderID);
		if (wlUser?.enable == true && wlThread?.enable == true && !isAdmin) {
			if (!wlUser.whiteListIds.includes(event.senderID) && !wlThread.whiteListThreadIds.includes(event.threadID)) return;
		} else if (wlUser?.enable == true && !wlUser.whiteListIds.includes(event.senderID) && !isAdmin) {
			return;
		} else if (wlThread?.enable == true && !wlThread.whiteListThreadIds.includes(event.threadID) && !isAdmin) {
			return;
		}

		// Duplicate MQTT event prevention
		if (event.messageID && event.type == "message") {
			if (storage5Message.includes(event.messageID)) {
				Object.keys(callbackListenTime).slice(0, -1).forEach(key => { callbackListenTime[key] = () => {}; });
			} else {
				storage5Message.push(event.messageID);
			}
			if (storage5Message.length > 5) storage5Message.shift();
		}

		const configLog = global.GoatBot.config.logEvents;
		if (configLog?.disableAll === false && configLog[event.type] !== false) {
			const participantIDs_ = [...(event.participantIDs || [])];
			if (event.participantIDs) event.participantIDs = 'Array(' + event.participantIDs.length + ')';
			console.log(colors.green((event.type || "").toUpperCase() + ":"), jsonStringifyColor(event, null, 2));
			if (event.participantIDs) event.participantIDs = participantIDs_;
		}

		if ((event.senderID && dataGban[event.senderID]) || (event.userID && dataGban[event.userID])) {
			if (event.body && event.threadID && event.body.startsWith(getPrefix(event.threadID))) {
				return api.sendMessage(getText('login', 'userBanned'), event.threadID);
			}
			return;
		}

		const handlerAction = require("../handler/handlerAction.js")(
			api, threadModel, userModel, dashBoardModel, globalModel, usersData, threadsData, dashBoardData, globalData
		);
		if (!hasBanned) handlerAction(event);
	}

	function createCallBackListen(key) {
		key = randomString(10) + (key || Date.now());
		callbackListenTime[key] = callBackListen;
		return (error, event) => callbackListenTime[key](error, event);
	}

	await stopListening();
	global.GoatBot.Listening = api.listenMqtt(createCallBackListen());
	global.GoatBot.callBackListen = callBackListen;

	startUptimeServer(false);

	const { restartListenMqtt } = global.GoatBot.config;
	if (restartListenMqtt?.enable == true) {
		global.intervalRestartListenMqtt = setInterval(async () => {
			try {
				await stopListening();
				await sleep(1000);
				global.GoatBot.Listening = api.listenMqtt(createCallBackListen());
			} catch (e) { recoverListener("hourly restart failed"); }
		}, restartListenMqtt.timeRestart);
	}

	if (global.intervalListenWatchdog) clearInterval(global.intervalListenWatchdog);
	global.intervalListenWatchdog = setInterval(() => {
		if (Date.now() - lastListenActivity > 20 * 60 * 1000) {
			lastListenActivity = Date.now();
			recoverListener("no MQTT activity for 20 min");
		}
	}, 60 * 1000);

	if (existsSync(path.join(__dirname, "../autoUptime.js"))) {
		require('../autoUptime.js');
	}
}

function startUptimeServer(isOffline) {
	if (global.serverUptimeRunning || global.GoatBot.config.dashBoard?.enable) return;
	const http = require('http');
	const express = require('express');
	const app = express();
	const server = http.createServer(app);
	const PORT = process.env.PORT || (!isNaN(global.GoatBot.config.serverUptime?.port) && global.GoatBot.config.serverUptime.port) || 3001;

	app.get('/health', (req, res) => {
		res.status(isOffline ? 503 : 200).json({
			status: isOffline ? "offline" : "online",
			activeAccount: global.GoatBot.activeAccountFile,
			pool: global.GoatBot.accountPoolStatus,
			uptime: process.uptime()
		});
	});

	app.get('/uptime', global.responseUptimeCurrent);

	app.get('/', (req, res) => {
		if (isOffline) {
			return res.status(503).send(`<!DOCTYPE html><html><head><title>Aliya Bot - Restarting / Offline</title></head>
<body style="background:#0f051d;color:#fff;font-family:sans-serif;text-align:center;padding-top:100px">
<h1 style="color:#ff4d6d">⚠️ Aliya Bot Server Restarting / Offline</h1>
<p>All 5 accounts (account.txt to account5.txt) failed or are suspended. Please update cookies to resume.</p>
</body></html>`);
		}
		res.send(`<!DOCTYPE html><html><head><title>Aliya Official V4</title></head>
<body style="background:#0f051d;color:#fff;font-family:sans-serif;text-align:center;padding-top:100px">
<h1 style="color:#4cc9f0">👑 ALIYA OFFICIAL V4 — ONLINE</h1>
<p>Active Account: <b>${global.GoatBot.activeAccountFile}</b> | Bot UID: <b>${global.GoatBot.botID}</b></p>
</body></html>`);
	});

	server.listen(PORT, () => {
		global.serverUptimeRunning = true;
		log.info("UPTIME", `Server active on port ${PORT}`);
	});
}

global.GoatBot.reLoginBot = startBot;
startBot().catch(triggerWolfFailover);
