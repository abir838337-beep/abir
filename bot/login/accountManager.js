/**
 * @author Mr.king x Aliya
 * Account manager for Aliya Official V4 and Wolf.js.
 * 
 * Manages cookie files (account.txt, account2.txt, account3.txt, account4.txt, account5.txt),
 * their active status, failures, cooldowns, and error classifications.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname);
const SLOTS = 5;

// Root directory-র account.txt-এ পয়েন্ট করার জন্য সঠিক পাথ
const slotFile = n => path.join(ROOT, "..", "..", n === 1 ? "account.txt" : `account${n}.txt`);

const COOLDOWN = {
	expired: 10 * 60 * 1000,      // 10 min
	twofa: 15 * 60 * 1000,        // 15 min
	checkpoint: 30 * 60 * 1000,   // 30 min
	suspended: 60 * 60 * 1000,    // 60 min
	network: 3 * 60 * 1000,       // 3 min
	other: 5 * 60 * 1000          // 5 min
};

const LABEL = {
	expired: "EXPIRED / LOGGED OUT",
	twofa: "TWO-FACTOR AUTH REQUIRED",
	checkpoint: "CHECKPOINT REQUIRED",
	suspended: "SUSPENDED / LOCKED",
	network: "NETWORK ERROR",
	other: "FAILED"
};

const STATE_FILE = path.join(ROOT, "data", "accounts.json");

function loadState() {
	try {
		if (fs.existsSync(STATE_FILE)) {
			const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
			if (data && typeof data === "object") return data;
		}
	} catch (e) { /* ignore */ }
	
	const slots = {};
	for (let n = 1; n <= SLOTS; n++) {
		slots[n] = { status: "untested", failedAt: 0, cooldownUntil: 0, reason: "", maskedID: "" };
	}
	return { forced: null, active: null, slots };
}

function saveState(state) {
	try {
		fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
		fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
		return true;
	} catch (e) {
		return false;
	}
}

function validSlot(n) {
	return Number.isInteger(n) && n >= 1 && n <= SLOTS;
}

function errorText(err) {
	if (!err) return "";
	if (typeof err === "string") return err;
	if (err.message) return String(err.message);
	if (err.error) return String(err.error);
	return JSON.stringify(err);
}

function classifyError(err) {
	const text = errorText(err).toLowerCase();
	if (/suspended|disabled|locked|banned|policy/i.test(text)) return "suspended";
	if (/checkpoint|verification|auth_checkpoint|challenge/i.test(text)) return "checkpoint";
	if (/twofa|2fa|otp|code/i.test(text)) return "twofa";
	if (/expired|not logged in|invalid session|session expired|cookie/i.test(text)) return "expired";
	if (/ EAI_AGAIN | ENOTFOUND | ETIMEDOUT | ECONNREFUSED | socket | network | timeout /i.test(text)) return "network";
	return "other";
}

function maskID(id) {
	const s = String(id || "").trim();
	if (s.length <= 4) return s;
	return s.slice(0, 2) + "****" + s.slice(-2);
}

function getEnvContent(n) {
	const envKey = n === 1 ? "ACCOUNT_TXT" : `ACCOUNT${n}_TXT`;
	return process.env[envKey] || process.env[`ACCOUNT_${n}`] || "";
}

function inspect(n, state = loadState()) {
	const file = slotFile(n);
	let exists = false;
	let text = "";
	
	// প্রথমে ফাইল থেকে রিড করার চেষ্টা করবে
	try {
		if (fs.existsSync(file)) {
			text = fs.readFileSync(file, "utf8").trim();
		}
	} catch (e) { /* ignore */ }

	// যদি ফাইল ফাঁকা থাকে বা না পাওয়া যায়, তবে রেন্ডারের Environment Variable থেকে স্বয়ংক্রিয়ভাবে নিয়ে নিবে
	if (!text) {
		text = getEnvContent(n).trim();
		if (text) {
			try {
				fs.mkdirSync(path.dirname(file), { recursive: true });
				fs.writeFileSync(file, text + "\n", { mode: 0o600 });
			} catch (e) { /* ignore */ }
		}
	}

	exists = text.length > 0;
	const rec = state.slots[n] || { status: "untested", failedAt: 0, cooldownUntil: 0, reason: "", maskedID: "" };
	if (!exists) {
		return { slot: n, file: path.basename(file), exists: false, valid: false, status: "empty", reason: "file is empty or missing", maskedID: "" };
	}

	let maskedID = rec.maskedID || "";
	if (!maskedID) {
		const m = text.match(/c_user\s*[:=]\s*([0-9]+)/i) || text.match(/"key"\s*:\s*"c_user"[^}]*"value"\s*:\s*"([0-9]+)"/);
		if (m) maskedID = maskID(m[1]);
	}

	const now = Date.now();
	let status = rec.status;
	let cooldownUntil = rec.cooldownUntil || 0;
	if (cooldownUntil && now > cooldownUntil) {
		cooldownUntil = 0;
		if (status === "expired" || status === "other" || status === "network") status = "untested";
	}

	return {
		slot: n,
		file: path.basename(file),
		exists: true,
		valid: status !== "suspended" && status !== "checkpoint",
		status: status === "untested" && exists ? "ok" : status,
		reason: rec.reason,
		cooldownUntil,
		maskedID,
		forced: state.forced === n
	};
}

function markFail(n, detail, text) {
	if (!validSlot(n)) return;
	const state = loadState();
	const now = Date.now();
	const cd = COOLDOWN[detail] || COOLDOWN.other;
	state.slots[n] = {
		status: detail,
		failedAt: now,
	cooldownUntil: now + cd,
		reason: errorText(text),
		maskedID: state.slots[n] ? state.slots[n].maskedID : ""
	};
	saveState(state);
}

function markActive(n, uid) {
	if (!validSlot(n)) return;
	const state = loadState();
	state.active = n;
	const maskedID = uid ? maskID(uid) : (state.slots[n] ? state.slots[n].maskedID : "");
	state.slots[n] = {
		status: "active",
		failedAt: 0,
		cooldownUntil: 0,
		reason: "",
		maskedID
	};
	saveState(state);
}

function releaseCurrent() {
	const state = loadState();
	if (state.active && state.slots[state.active] && state.slots[state.active].status === "active") {
		state.slots[state.active].status = "ok";
	}
	state.active = null;
	saveState(state);
}

function setForced(n) {
	const state = loadState();
	state.forced = validSlot(n) ? n : null;
	saveState(state);
}

function seedFromEnv() {
	for (let n = 1; n <= SLOTS; n++) {
		const file = slotFile(n);
		let content = "";
		try {
			if (fs.existsSync(file)) content = fs.readFileSync(file, "utf8").trim();
		} catch (e) {}

		if (!content) {
			const val = getEnvContent(n);
			if (val) {
				try {
					fs.mkdirSync(path.dirname(file), { recursive: true });
					fs.writeFileSync(file, String(val).trim() + "\n", { mode: 0o600 });
				} catch (e) { /* ignore */ }
			}
		}
	}
}

module.exports = {
	SLOTS,
	slotFile,
	COOLDOWN,
	LABEL,
	loadState,
	saveState,
	validSlot,
	errorText,
	classifyError,
	maskID,
	inspect,
	markFail,
	markActive,
	releaseCurrent,
	setForced,
-	seedFromEnv
};
		
