/**
 * @author Mr.king x Aliya
 * Account pool for Wolf.js (and any other engine that wants to log in by itself).
 *
 * It is a thin layer on top of ../../accountManager.js, so Aliya.js (through index.js) and Wolf.js always
 * share ONE truth about the five cookie files (data/accounts.json): when one engine finds an account dead,
 * the other one skips it too.
 *
 *   account.txt · account2.txt · account3.txt · account4.txt · account5.txt
 */

"use strict";

const fs = require("fs");
const path = require("path");
const manager = require("../../accountManager.js");

const ROOT = path.join(__dirname, "..", "..");
const FILES = Array.from({ length: manager.SLOTS }, (_, i) => path.basename(manager.slotFile(i + 1)));

const slotOf = file => FILES.indexOf(path.basename(String(file || ""))) + 1; // 0 = not one of ours
const notices = [];

function note(text) {
	notices.push({ at: Date.now(), text });
	if (notices.length > 20) notices.shift();
}

const short = (s, n = 90) => String(s === undefined || s === null ? "" : s).replace(/\s+/g, " ").slice(0, n);
const errText = e => manager.errorText(e) || String(e);

// Coarse kinds are what engines need (suspended / expired / network / other).
// `detail` keeps the exact kind (checkpoint, twofa ...) for the status table.
function classify(err) {
	const text = errText(err);
	const detail = manager.classifyError(err);
	let kind = "other";
	if (detail === "suspended" || detail === "checkpoint") kind = "suspended";
	else if (detail === "expired" || detail === "twofa") kind = "expired";
	else if (detail === "network") kind = "network";
	return { kind, detail, text };
}

function readText(file) {
	try { return fs.readFileSync(manager.slotFile(slotOf(file)), "utf8").trim(); } catch (e) { return ""; }
}

function filePath(file) {
	const n = slotOf(file);
	return n ? manager.slotFile(n) : path.join(ROOT, path.basename(String(file)));
}

function hashText(text) {
	let h = 5381;
	const s = String(text || "").trim();
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return `${s.length}:${h >>> 0}`;
}

// Usable now, in the order they should be tried (a forced account first). `deadOnes` are valid cookie files that
// are resting after a failed login - tried last, only when nothing else is left.
function candidates() {
	const state = manager.loadState();
	const usable = [];
	const deadOnes = [];
	const order = [];
	if (manager.validSlot(state.forced)) order.push(state.forced);
	for (let n = 1; n <= manager.SLOTS; n++) if (!order.includes(n)) order.push(n);
	for (const n of order) {
		const a = manager.inspect(n, state);
		if (!a.valid) continue;
		(a.cooldownUntil && !a.forced ? deadOnes : usable).push(FILES[n - 1]);
	}
	return { usable, deadOnes };
}

function cookie(key, value) {
	const now = new Date().toISOString();
	return { key, value, domain: "facebook.com", path: "/", hostOnly: true, creation: now, lastAccessed: now };
}

// Any cookie format -> fca appState array. opts.iUser adds the i_user cookie (pages / professional profiles).
async function parse(raw, opts = {}) {
	const text = String(raw || "").replace(/^\uFEFF/, "").trim();
	if (!text) throw new Error("cookie file is empty");
	if (text.startsWith("EAAAA")) throw new Error("access-token files need the main engine (Aliya.js)");

	let appState;
	if (text[0] === "[" || text[0] === "{") {
		let data;
		try { data = JSON.parse(text); } catch (e) { throw new Error("not valid JSON"); }
		if (!Array.isArray(data) && data && Array.isArray(data.cookies)) data = data.cookies;
		if (!Array.isArray(data)) throw new Error("JSON must be a cookie array");
		appState = data
			.filter(c => c && typeof c === "object" && (c.key || c.name))
			.map(c => ({ ...c, key: c.key || c.name, value: String(c.value === undefined || c.value === null ? "" : c.value) }));
	}
	else if (/c_user\s*=/.test(text)) {
		appState = text.split(/[;\n]/).map(p => {
			const i = p.indexOf("=");
			return i > 0 ? cookie(p.slice(0, i).trim(), p.slice(i + 1).trim()) : null;
		}).filter(Boolean);
	}
	else if (text.includes("\t")) {
		appState = text.split("\n").map(l => l.split("\t")).filter(p => p.length >= 7 && !String(p[0]).startsWith("#"))
			.map(p => cookie(p[5].trim(), p[6].trim()));
	}
	else throw new Error("unknown cookie format");

	if (!appState.some(c => c.key === "c_user")) throw new Error("c_user cookie is missing");
	if (!appState.some(c => c.key === "xs")) throw new Error("xs cookie is missing");
	if (opts.iUser && !appState.some(c => c.key === "i_user")) appState.push(cookie("i_user", String(opts.iUser)));
	return appState;
}

// Same rule as login.js: keep only the cookies Facebook needs
function filterKeys(appState) {
	return (Array.isArray(appState) ? appState : []).filter(c => c && ["c_user", "xs", "datr", "fr", "sb", "i_user"].includes(c.key));
}

function appStateIsHealthy(appState) {
	const list = Array.isArray(appState) ? appState : [];
	return list.some(c => c.key === "c_user" && c.value) && list.some(c => c.key === "xs" && c.value);
}

function cookieString(appState) {
	return (Array.isArray(appState) ? appState : []).map(c => `${c.key}=${c.value}`).join("; ");
}

// Atomic write; never leaves a half-written cookie file behind
function writeText(file, text) {
	const target = filePath(file);
	const tmp = `${target}.${process.pid}.tmp`;
	try {
		fs.writeFileSync(tmp, String(text).trim() + "\n", { mode: 0o600 });
		fs.renameSync(tmp, target);
		return true;
	}
	catch (e) {
		try { fs.unlinkSync(tmp); } catch (x) { /* ignore */ }
		return false;
	}
}

// The project's own Facebook library first (it is what Aliya.js uses), then the usual packages
function loadFca() {
	const names = [path.join(ROOT, "fb-chat-api"), "ws3-fca", "@dongdev/fca-unofficial", "fca-unofficial"];
	for (const name of names) {
		try {
			const m = require(name);
			const fn = typeof m === "function" ? m : (m && (m.default || m.login));
			if (typeof fn === "function") return fn;
		}
		catch (e) { /* try the next one */ }
	}
	return null;
}

function tryLogin(appState, opts, ms) {
	return new Promise(resolve => {
		const login = loadFca();
		if (!login) return resolve({ ok: false, fatal: true, error: "no Facebook chat library installed (npm install)" });
		let done = false;
		const finish = result => { if (!done) { done = true; clearTimeout(timer); resolve(result); } };
		const timer = setTimeout(() => finish({ ok: false, error: "login timed out (network)" }), ms || 45000);
		try {
			login({ appState }, { ...(opts || {}) }, (err, api) => {
				if (err || !api) finish({ ok: false, error: errText(err || "login returned no api") });
				else finish({ ok: true, api });
			});
		}
		catch (e) {
			finish({ ok: false, error: e && e.message ? e.message : String(e) });
		}
	});
}

// ───────────────────────────── bookkeeping ───────────────────────────── //

function markOk(file) {
	const n = slotOf(file);
	if (!n) return;
	const state = manager.loadState();
	const rec = state.slots[n];
	if (rec && manager.COOLDOWN[rec.status]) manager.markActive(n); // it worked after all: forgive
}

function markDead(file, kind, text) {
	const n = slotOf(file);
	if (!n) return;
	// Engines only know "suspended" / "expired" - keep the exact reason (checkpoint, 2FA...) from the text
	let detail = manager.classifyError(text);
	if (!manager.COOLDOWN[detail]) detail = kind === "suspended" ? "suspended" : "expired";
	manager.markFail(n, detail, text);
	note(`${file}: ${manager.LABEL[detail] || detail}`);
}

function markFailed(file, text) {
	const n = slotOf(file);
	if (n) manager.markFail(n, "other", text);
}

function setActive(file, uid) {
	if (!file) return manager.releaseCurrent();
	const n = slotOf(file);
	if (n) manager.markActive(n, uid);
}

function clearPreferred() {
	manager.setForced(null);
}

const STATUS_TEXT = {
	active: "ACTIVE (IN USE)", ok: "AVAILABLE (STANDBY)", untested: "AVAILABLE (STANDBY)",
	expired: "LOGGED OUT / EXPIRED", twofa: "LOGGED OUT / EXPIRED",
	checkpoint: "SUSPENDED / LOCKED", suspended: "SUSPENDED / LOCKED",
	other: "FAILED", invalid: "INVALID FORMAT", empty: "EMPTY"
};

function statusTable({ active, results } = {}) {
	return FILES.map((file, i) => {
		const a = manager.inspect(i + 1);
		const r = results && results[file];
		if (active && file === active) return { file, status: STATUS_TEXT.active, detail: a.maskedID ? `id ${a.maskedID}` : "" };
		if (r) return { file, status: r.status, detail: r.detail || "" };
		return { file, status: STATUS_TEXT[a.status] || a.status, detail: short(a.reason || (a.maskedID ? `id ${a.maskedID}` : ""), 80) };
	});
}

function toObject(table) {
	const o = {};
	for (const r of table || []) o[r.file] = { status: r.status, detail: r.detail };
	return o;
}

function takeNotices() {
	return notices.splice(0, notices.length);
}

module.exports = {
	FILES, short, errText, classify,
	seedFromEnv: manager.seedFromEnv,
	readText, filePath, hashText, candidates, parse,
	tryLogin, markOk, markDead, markFailed, setActive, clearPreferred,
	statusTable, toObject, filterKeys, appStateIsHealthy, writeText, cookieString, takeNotices,
	manager
};
