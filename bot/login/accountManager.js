/**
 * ============================================================================
 * ALIYA OFFICIAL V4 - ACCOUNT MANAGER (single source of truth)
 * Maintained by Mr.king
 *
 * Owns the five cookie slots:
 *   account.txt  account2.txt  account3.txt  account4.txt  account5.txt
 *
 * Both engines (Aliya.js and Wolf.js) and the admin command read/write only
 * through this file, so they can never disagree about which account is active,
 * which one failed, which one is suspended and which one is a forced switch.
 *
 * State file: bot/login/data/accounts.json
 * Atomic writes. A corrupted state file is kept as accounts.corrupt-<ts>.json.
 * ============================================================================
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const SLOTS = 5;
const STATE_FILE = path.join(__dirname, "data", "accounts.json");
const slotFile = n => path.join(ROOT, n === 1 ? "account.txt" : `account${n}.txt`);

// Short cooldowns: a resting account is tried again as a last resort on every
// restart, and becomes fully available again as soon as the timer expires.
const COOLDOWN = {
	expired: 5 * 60 * 1000,
	twofa: 10 * 60 * 1000,
	checkpoint: 20 * 60 * 1000,
	suspended: 30 * 60 * 1000,
	network: 2 * 60 * 1000,
	other: 3 * 60 * 1000
};

const LABEL = {
	active: "ACTIVE (IN USE)",
	ok: "AVAILABLE (STANDBY)",
	untested: "AVAILABLE (STANDBY)",
	expired: "LOGGED OUT / EXPIRED",
	twofa: "TWO-FACTOR AUTH REQUIRED",
	checkpoint: "CHECKPOINT REQUIRED",
	suspended: "SUSPENDED / LOCKED",
	network: "NETWORK ERROR",
	other: "FAILED",
	invalid: "INVALID FORMAT",
	empty: "EMPTY"
};

const ICON = {
	active: "🟢", ok: "🔵", untested: "🔵", expired: "🟠", twofa: "🟠",
	checkpoint: "🔴", suspended: "🔴", network: "🟠", other: "🟠",
	invalid: "🟠", empty: "⚪"
};

// Never write a cookie value, token or long random string into logs / status pages.
function sanitize(text, limit = 120) {
	return String(text === undefined || text === null ? "" : text)
		.replace(/\b(c_user|xs|datr|fr|sb|i_user|appstate|access_token|token|password|secret)\s*[=:]\s*\S+/gi, "$1=[hidden]")
		.replace(/EAAA[A-Za-z0-9_-]+/g, "[token-hidden]")
		.replace(/[A-Za-z0-9%_\-.]{28,}/g, "[hidden]")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, limit);
}

function validSlot(n) {
	n = Number(n);
	return Number.isInteger(n) && n >= 1 && n <= SLOTS;
}

function blankSlot() {
	return { status: "untested", failedAt: 0, cooldownUntil: 0, reason: "", maskedID: "" };
}

function normalizeState(input) {
	const out = { forced: null, active: null, slots: {}, updatedAt: Date.now() };
	const src = input && typeof input === "object" ? input : {};
	out.forced = validSlot(src.forced) ? Number(src.forced) : null;
	out.active = validSlot(src.active) ? Number(src.active) : null;
	for (let n = 1; n <= SLOTS; n++) {
		const raw = src.slots && src.slots[n] ? src.slots[n] : {};
		out.slots[n] = {
			status: LABEL[raw.status] ? raw.status : "untested",
			failedAt: Number(raw.failedAt) || 0,
			cooldownUntil: Number(raw.cooldownUntil) || 0,
			reason: sanitize(raw.reason),
			maskedID: sanitize(raw.maskedID, 24)
		};
	}
	return out;
}

function loadState() {
	try {
		if (fs.existsSync(STATE_FILE)) {
			const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
			if (data && typeof data === "object" && data.slots) return normalizeState(data);
		}
	}
	catch (e) {
		try {
			if (fs.existsSync(STATE_FILE))
				fs.copyFileSync(STATE_FILE, `${STATE_FILE}.corrupt-${Date.now()}`);
		}
		catch (x) { /* ignore */ }
		console.warn(`[ACCOUNT_MANAGER] State file was damaged; a backup was kept and a fresh one is used. (${e.message})`);
	}
	return normalizeState(null);
}

function saveState(state) {
	try {
		fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
		state.updatedAt = Date.now();
		const tmp = `${STATE_FILE}.${process.pid}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(normalizeState(state), null, 2), { mode: 0o600 });
		fs.renameSync(tmp, STATE_FILE);
		return true;
	}
	catch (e) {
		console.warn(`[ACCOUNT_MANAGER] Could not save account state: ${e.message}`);
		return false;
	}
}

function errorText(err) {
	if (!err) return "";
	if (typeof err === "string") return err;
	if (err.message) return String(err.message);
	if (err.error) return String(err.error);
	if (err.error_description) return String(err.error_description);
	try { return JSON.stringify(err); } catch (e) { return String(err); }
}

function classifyError(err) {
	const text = errorText(err).toLowerCase();
	if (/\b(suspended|disabled|locked|banned|restricted|policy violation)\b/.test(text)) return "suspended";
	if (/\b(checkpoint|auth_checkpoint|verification|challenge|confirm your account)\b/.test(text)) return "checkpoint";
	if (/\b(twofa|2fa|otp|two-factor|two factor|verification code)\b/.test(text)) return "twofa";
	if (/\b(expired|not logged in|invalid session|session expired|logged out|cookie invalid|c_user)\b/.test(text)) return "expired";
	if (/\b(eai_again|enotfound|etimedout|econnrefused|econnreset|socket|network|timeout|timed out|offline)\b/.test(text)) return "network";
	return "other";
}

function maskID(id) {
	const s = String(id === undefined || id === null ? "" : id).trim();
	if (!/^\d+$/.test(s)) return "";
	if (s.length <= 4) return s;
	return s.slice(0, 2) + "****" + s.slice(-2);
}

function getEnvContent(n) {
	const key = n === 1 ? "ACCOUNT_TXT" : `ACCOUNT${n}_TXT`;
	return process.env[key] || process.env[`ACCOUNT_${n}`] || "";
}

function readSlotText(n) {
	try { return fs.readFileSync(slotFile(n), "utf8").replace(/^\uFEFF/, "").trim(); }
	catch (e) { return ""; }
}

function hasCookieShape(text) {
	const s = String(text || "").trim();
	if (!s) return false;
	if (/^EAAAA[A-Za-z0-9_-]+/.test(s)) return true;
	if (/\bc_user\s*[=:]/.test(s) && /\b(xs|sb|datr|fr)\s*[=:]/.test(s)) return true;
	if (s[0] === "[" || s[0] === "{") return /\bc_user\b/.test(s) && /\b(xs|sb|datr|fr)\b/.test(s);
	return false;
}

// Fills empty cookie files from environment variables on Render/Railway/etc.
function seedFromEnv() {
	for (let n = 1; n <= SLOTS; n++) {
		if (readSlotText(n)) continue;
		const value = getEnvContent(n).trim();
		if (!value) continue;
		try {
			fs.mkdirSync(path.dirname(slotFile(n)), { recursive: true });
			fs.writeFileSync(slotFile(n), value + "\n", { mode: 0o600 });
		}
		catch (e) { /* read-only host: the env value is still used by inspect() */ }
	}
	return true;
}

function inspect(n, state = loadState()) {
	n = Number(n);
	const file = slotFile(n);
	let text = readSlotText(n);
	if (!text) text = getEnvContent(n).trim();

	const rec = state.slots[n] || blankSlot();
	const now = Date.now();
	let status = LABEL[rec.status] ? rec.status : "untested";
	let cooldownUntil = Number(rec.cooldownUntil) || 0;

	// Every resting state expires. Suspended accounts are tried again as a last
	// resort instead of being banned forever by a stale status entry.
	if (cooldownUntil && now >= cooldownUntil) {
		cooldownUntil = 0;
		status = "untested";
	}

	const exists = text.length > 0;
	const cookieOK = hasCookieShape(text);
	let missingID = "";
	if (exists && !cookieOK) missingID = "cookie is missing c_user/xs or token";

	return {
		slot: n,
		file: path.basename(file),
		exists,
		hasCookie: cookieOK,
		valid: exists && cookieOK,
		status: !exists ? "empty" : (!cookieOK ? "invalid" : status === "untested" ? "ok" : status),
		rawStatus: status,
		reason: sanitize(rec.reason || missingID),
		cooldownUntil,
		cooldownLeft: cooldownUntil ? cooldownUntil - now : 0,
		maskedID: rec.maskedID || (() => {
			const m = text.match(/\bc_user\s*[=:]\s*["']?(\d{5,})/) || text.match(/"key"\s*:\s*"c_user"[^}]{0,80}"value"\s*:\s*"(\d{5,})"/);
			return m ? maskID(m[1]) : "";
		})(),
		forced: state.forced === n,
		active: state.active === n
	};
}

function describe(n, state = loadState()) {
	const a = inspect(n, state);
	let label = LABEL[a.status] || String(a.status).toUpperCase();
	if (a.active) label = LABEL.active;
	if (a.cooldownLeft > 0 && !a.active) label += ` (retry in ${Math.ceil(a.cooldownLeft / 1000)}s)`;
	return {
		slot: n,
		file: a.file,
		status: label,
		icon: ICON[a.status] || "⚪",
		detail: [a.maskedID ? `id ${a.maskedID}` : "", sanitize(a.reason)].filter(Boolean).join(" | "),
		forced: a.forced,
		active: a.active
	};
}

function markFail(n, detail, text) {
	if (!validSlot(n)) return false;
	const state = loadState();
	const key = COOLDOWN[detail] ? detail : "other";
	const old = state.slots[n] || blankSlot();
	state.slots[n] = {
		status: key,
		failedAt: Date.now(),
		cooldownUntil: Date.now() + COOLDOWN[key],
		reason: sanitize(errorText(text)),
		maskedID: old.maskedID || ""
	};
	if (state.active === n) state.active = null;
	return saveState(state);
}

function markActive(n, uid) {
	if (!validSlot(n)) return false;
	const state = loadState();
	const old = state.slots[n] || blankSlot();
	state.active = n;
	state.slots[n] = {
		status: "active",
		failedAt: 0,
		cooldownUntil: 0,
		reason: "",
		maskedID: maskID(uid) || old.maskedID || ""
	};
	return saveState(state);
}

function releaseCurrent() {
	const state = loadState();
	if (validSlot(state.active) && state.slots[state.active] && state.slots[state.active].status === "active") {
		state.slots[state.active].status = "ok";
	}
	state.active = null;
	return saveState(state);
}

// 0 / null / undefined clears a forced switch. A forced slot is tried FIRST.
function setForced(n) {
	const state = loadState();
	state.forced = validSlot(n) ? Number(n) : null;
	return saveState(state);
}

function getForced() {
	return loadState().forced;
}

// Clears the failure record of a slot so the next restart tries it immediately.
function resetSlot(n) {
	if (!validSlot(n)) return false;
	const state = loadState();
	state.slots[n] = blankSlot();
	return saveState(state);
}

function nextAvailable(afterSlot) {
	let start = validSlot(afterSlot) ? Number(afterSlot) : 0;
	const state = loadState();
	for (let step = 1; step <= SLOTS; step++) {
		const n = ((start - 1 + step) % SLOTS) + 1;
		const a = inspect(n, state);
		if (a.valid && a.status !== "suspended" && a.status !== "checkpoint") return n;
	}
	return null;
}

module.exports = {
	SLOTS, ROOT, STATE_FILE, slotFile, COOLDOWN, LABEL, ICON,
	loadState, saveState, normalizeState, validSlot, errorText, classifyError,
	maskID, sanitize, hasCookieShape, seedFromEnv, readSlotText, inspect, describe,
	markFail, markActive, releaseCurrent, setForced, getForced, resetSlot, nextAvailable
};
