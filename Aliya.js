/**
 * ============================================================================
 * ALIYA OFFICIAL V4 - MASTER PRIMARY ENGINE
 * Maintained by Mr.king | Full Multi-Account Pool & Self-Healing Architecture
 * ============================================================================
 */
"use strict";

process.on('unhandledRejection', error => console.error("[ALIYA_UNHANDLED_REJECTION]", error?.message || error));
process.on('uncaughtException', error => {
	console.error("[ALIYA_UNCAUGHT_EXCEPTION]", error?.stack || error);
	if (process.send) try { process.send({ type: "SWITCH_TO_WOLF" }); } catch (e) {}
	process.exit(4); // Exit code 4 triggers immediate Wolf.js failover in index.js
});

require("events").EventEmitter.defaultMaxListeners = 150;
process.setMaxListeners(150);

const fs = require("fs-extra");
const path = require("path");
const log = require('./logger/log.js');

process.env.BLUEBIRD_W_FORGOTTEN_RETURN = 0;

function getConfigPath(baseName, ext = ".json") {
	const devPath = path.join(__dirname, `${baseName}.dev${ext}`);
	const normalPath = path.join(__dirname, `${baseName}${ext}`);
	if (fs.existsSync(devPath)) return devPath;
	if (fs.existsSync(normalPath)) return normalPath;
	throw new Error(`Missing ${baseName}${ext}`);
}

function validJSON(pathDir) {
	if (!fs.existsSync(pathDir)) throw new Error(`File "${pathDir}" not found`);
	try {
		JSON.parse(fs.readFileSync(pathDir, "utf-8"));
		return true;
	} catch (err) {
		throw new Error(`JSON Syntax Error in ${pathDir}: ${err.message}`);
	}
}

// Ensure all 5 account files exist in root so rotation never crashes on ENOENT
const ACCOUNT_FILES = ["account.txt", "account2.txt", "account3.txt", "account4.txt", "account5.txt"];
for (const accFile of ACCOUNT_FILES) {
	try {
		const p = path.join(__dirname, accFile);
		if (!fs.existsSync(p)) fs.writeFileSync(p, "");
	} catch (e) {}
}

const dirConfig = getConfigPath("config", ".json");
const dirConfigCommands = getConfigPath("configCommands", ".json");
const dirAccount = path.join(__dirname, "account.txt");

for (const pathDir of [dirConfig, dirConfigCommands]) {
	try {
		validJSON(pathDir);
	} catch (err) {
		log.error("CONFIG", `${err.message}\nPlease fix JSON syntax and restart.`);
		process.exit(1);
	}
}

const config = require(dirConfig);
if (config.whiteListMode?.whiteListIds && Array.isArray(config.whiteListMode.whiteListIds)) {
	config.whiteListMode.whiteListIds = config.whiteListMode.whiteListIds.map(id => id.toString());
}
const configCommands = require(dirConfigCommands);

global.GoatBot = {
	startTime: Date.now() - process.uptime() * 1000,
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
	reLoginBot: function () {},
	Listening: null,
	oldListening: [],
	callbackListenTime: {},
	storage5Message: [],
	fcaApi: null,
	botID: null,
	activeAccountFile: "account.txt",
	accountPoolStatus: {}
};

global.db = {
	allThreadData: [],
	allUserData: [],
	allDashBoardData: [],
	allGlobalData: [],
	threadModel: null,
	userModel: null,
	dashboardModel: null,
	globalModel: null,
	threadsData: null,
	usersData: null,
	dashBoardData: null,
	globalData: null,
	receivedTheFirstMessage: {}
};

global.client = {
	dirConfig,
	dirConfigCommands,
	dirAccount,
	countDown: {},
	cache: {},
	database: {
		creatingThreadData: [],
		creatingUserData: [],
		creatingDashBoardData: [],
		creatingGlobalData: []
	},
	commandBanned: configCommands.commandBanned || []
};

const utils = require("./utils.js");
global.utils = utils;

global.temp = {
	createThreadData: [],
	createUserData: [],
	createThreadDataError: [],
	filesOfGoogleDrive: { arraybuffer: {}, stream: {}, fileNames: {} },
	contentScripts: { cmds: {}, events: {} }
};

// Safe Hot-Reloading
for (const [dir, prop, name] of [[dirConfigCommands, 'configCommands', 'CONFIG COMMANDS'], [dirConfig, 'config', 'CONFIG']]) {
	try {
		let lastModified = fs.statSync(dir).mtimeMs;
		fs.watch(dir, (eventType) => {
			if (eventType === 'change') {
				setTimeout(() => {
					try {
						const currentMtime = fs.statSync(dir).mtimeMs;
						if (lastModified === currentMtime) return;
						lastModified = currentMtime;
						global.GoatBot[prop] = JSON.parse(fs.readFileSync(dir, 'utf-8'));
						log.success(name, `Hot-reloaded ${path.basename(dir)}`);
					} catch (err) {}
				}, 250);
			}
		});
	} catch (err) {}
}

// Auto-Restart Scheduler
if (config.autoRestart) {
	const time = config.autoRestart.time;
	if (!isNaN(time) && time > 0) {
		setTimeout(() => {
			utils.log.info("AUTO RESTART", "Scheduled restart triggered...");
			process.exit(2);
		}, time);
	}
}

// Optional Non-Blocking Google Services Init
async function initGoogleServices() {
	try {
		const { gmailAccount } = config.credentials || {};
		if (gmailAccount?.email && gmailAccount?.refreshToken && gmailAccount?.clientId && gmailAccount?.clientSecret) {
			const { google } = require("googleapis");
			const nodemailer = require("nodemailer");
			const OAuth2_client = new google.auth.OAuth2(gmailAccount.clientId, gmailAccount.clientSecret);
			OAuth2_client.setCredentials({ refresh_token: gmailAccount.refreshToken });
			const accessToken = await OAuth2_client.getAccessToken();
			const transporter = nodemailer.createTransport({
				host: 'smtp.gmail.com',
				service: 'Gmail',
				auth: {
					type: 'OAuth2',
					user: gmailAccount.email,
					clientId: gmailAccount.clientId,
					clientSecret: gmailAccount.clientSecret,
					refreshToken: gmailAccount.refreshToken,
					accessToken
				}
			});
			global.utils.sendMail = async ({ to, subject, text, html, attachments }) =>
				await transporter.sendMail({ from: gmailAccount.email, to, subject, text, html, attachments });
			global.utils.transporter = transporter;
		}
	} catch (err) {
		log.warn("GMAIL_INIT", "Skipped Gmail setup: " + err.message);
	}

	try {
		if (utils.drive && typeof utils.drive.checkAndCreateParentFolder === "function") {
			utils.drive.parentID = await utils.drive.checkAndCreateParentFolder("AliyaBot");
		}
	} catch (err) {
		log.warn("GDRIVE_INIT", "Skipped Google Drive setup: " + err.message);
	}
}

(async () => {
	initGoogleServices().catch(() => {});
	console.log("\x1b[35m\x1b[1m👑 ALIYA V4 MASTER CORE\x1b[0m \x1b[90m|\x1b[0m \x1b[36mInitializing Multi-Account Login...\x1b[0m");
	require("./bot/login/login.js");
})();
	
