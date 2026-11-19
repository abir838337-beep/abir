/**
 * ============================================================================
 * ALIYA OFFICIAL V4 - ACCOUNT POOL (shared by Aliya.js, Wolf.js and commands)
 * Maintained by Mr.king
 *
 * Five slots, always in this order unless an admin forces one:
 *   account.txt  account2.txt  account3.txt  account4.txt  account5.txt
 *
 * A failed login marks the slot with a short cooldown. On the next start the
 * healthy slots are tried first and the resting ones are still tried as a last
 * resort, so the bot never gives up while at least one cookie is usable.
 * ============================================================================
 */

"use strict";

const fs = require("fs");
const path = require("path");
const manager = require("./accountManager.js");

const ROOT = path.join(__dirname, "..", "..");
const FILES = Array.from({ length: manager.SLOTS }, (_, i) => path.basename(manager.slotFile(i + 1)));
const notices = [];

function note(text) {
	notices.push({ at: Date.now(), text: manager.sanitize(text, 160) });
	if (notices.length > 30) notices.shift();
}

const short = (s, n = 90) => manager.sanitize(s, n);
const errText = e => manager.errorText(e) || String(e);

function classify(err) {
	const text = errText(err);
	const detail = manager.classifyError(err);
	let kind = "other";
	if (detail === "suspended" || detail === "checkpoint") kind = "suspended";
	else if (detail === "expired" || detail === "twofa") kind = "expired";
	else if (detail === "network") kind = "network";
	return { kind, detail, text };
}

function slotOf(file) {
	const name = path.basename(String(file || "")).trim();
	let n = FILES.indexOf(name) + 1;
	if (n) return n;
	n = Number(String(file || "").replace(/^account/i, "").replace(/\.txt$/i, ""));
	return manager.validSlot(n) ? n : 0;
}

function readText(file) {
	const n = slotOf(file);
	return manager.readSlotText(n || 1);
}

function filePath(file) {
	const n = slotOf(file);
	return n ? manager.slotFile(n) : path.join(ROOT, path.basename(String(file || "account.txt")));
}

function hashText(text) {
	let h = 5381;
	const s = String(text || "").trim();
	for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
	return `${s.length}:${h >>> 0}`;
}

// Forced slot first, then account.txt .. account5.txt. Resting accounts come
// last but are never removed: "try until one logs in" is the whole point.
function candidates() {
	const state = manager.loadState();
	const usable = [];
	const deadOnes = [];
	const forced = manager.validSlot(state.forced) ? Number(state.forced) : 0;
	const order = forced ? [forced] : [];
	for (let n = 1; n <= manager.SLOTS; n++) if (!order.includes(n)) order.push(n);

	for (const n of order) {
		const a = manager.inspect(n, state);
		if (!a.valid) continue;
		if (a.cooldownLeft > 0 && !a.forced) deadOnes.push(FILES[n - 1]);
		else usable.push(FILES[n - 1]);
	}
	return { usable, deadOnes, forced: forced ? FILES[forced - 1] : null };
}

function cookie(key, value) {
	const now = new Date().toISOString();
	return { key, value, domain: "facebook.com", path: "/", hostOnly: true, creation: now, lastAccessed: now };
}

// Cookie string, Netscape TSV, appState array or { cookies: [...] } -> fca appState
async function parse(raw, opts = {}) {
	const text = String(raw || "").replace(/^\uFEFF/, "").trim();
	if (!text) throw new Error("cookie file is empty");
	if (/^EAAAA[A-Za-z0-9_-]+/.test(text)) throw new Error("access-token files are handled by the main engine only, use a cookie file here");

	let appState;
	if (text[0] === "[" || text[0] === "{") {
		let data;
		try { data = JSON.parse(text); } catch (e) { throw new Error("cookie file is not valid JSON"); }
		if (!Array.isArray(data) && data && Array.isArray(data.cookies)) data = data.cookies;
		if (!Array.isArray(data)) throw new Error("JSON must be an array of cookies or an object with a cookies array");
		appState = data
			.filter(c => c && typeof c === "object" && (c.key || c.name))
			.map(c => ({ ...c, key: c.key || c.name, value: String(c.value === undefined || c.value === null ? "" : c.value) }));
	}
	else if (/\bc_user\s*=/.test(text)) {
		appState = text.split(/[;\n]/).map(p => {
			const i = p.indexOf("=");
			return i > 0 ? cookie(p.slice(0, i).trim(), p.slice(i + 1).trim()) : null;
		}).filter(Boolean);
	}
	else if (text.includes("\t")) {
		appState = text.split(/\r?\n/).map(l => l.split("\t"))
			.filter(p => p.length >= 7 && !String(p[0]).startsWith("#"))
			.map(p => cookie(p[5].trim(), p[6].trim()));
	}
	else throw new Error("unknown cookie format (use a cookie string, Netscape TSV or appState JSON)");

	if (!appState.some(c => c.key === "c_user")) throw new Error("c_user cookie is missing");
	if (!appState.some(c => c.key === "xs")) throw new Error("xs cookie is missing");
	if (opts.iUser && !appState.some(c => c.key === "i_user")) appState.push(cookie("i_user", String(opts.iUser)));
	return appState;
}

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

function writeText(file, text) {
	const target = filePath(file);
	const tmp = `${target}.${process.pid}.tmp`;
	try {
		fs.mkdirSync(path.dirname(target), { recursive: true });
		fs.writeFileSync(tmp, String(text).trim() + "\n", { mode: 0o600 });
		fs.renameSync(tmp, target);
		return true;
	}
	catch (e) {
		try { fs.unlinkSync(tmp); } catch (x) { /* ignore */ }
		return false;
	}
}

function loadFca() {
	const names = [
		path.join(ROOT, "fb-chat-api"),
		"ws3-fca",
		"fca-saim-x69x",
		"@dongdev/fca-unofficial",
		"fca-unofficial"
	];
	for (const name of names) {
		try {
			const m = require(name);
			const fn = typeof m === "function" ? m : (m && (m.default || m.login));
			if (typeof fn === "function") return fn;
		}
		catch (e) { /* try the next library */ }
	}
	return null;
}

function tryLogin(appState, opts, ms) {
	return new Promise(resolve => {
		let login = null;
		try { login = loadFca(); } catch (e) { login = null; }
		if (!login) return resolve({ ok: false, fatal: true, error: "no Facebook chat library installed (run: npm install)" });

		let done = false;
		const timer = setTimeout(() => finish({ ok: false, error: "login timed out (network)" }), Number(ms) || 45000);
		function finish(result) {
			if (done) return;
			done = true;
			clearTimeout(timer);
			resolve(result);
		}
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

// ─────────────────────── bookkeeping / admin control ───────────────────────

function markOk(file) {
	const n = slotOf(file);
	if (!n) return;
	const state = manager.loadState();
	const rec = state.slots[n];
	if (rec && (rec.status !== "active" || rec.cooldownUntil)) manager.markActive(n);
}

function markDead(file, kind, text) {
	const n = slotOf(file);
	if (!n) return;
	let detail = manager.classifyError(text);
	if (!manager.COOLDOWN[detail]) detail = kind === "suspended" ? "suspended" : "expired";
	manager.markFail(n, detail, text);
	note(`${FILES[n - 1]}: ${manager.LABEL[detail] || detail}`);
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

function switchTo(fileOrSlot) {
	const named = slotOf(fileOrSlot);
	const n = named || (manager.validSlot(fileOrSlot) ? Number(fileOrSlot) : 0);
	if (!n || !manager.inspect(n).valid) return { ok: false, reason: "slot is empty or has no valid cookie" };
	manager.setForced(n);
	note(`${FILES[n - 1]}: forced switch requested`);
	return { ok: true, slot: n, file: FILES[n - 1] };
}

function resetSlot(fileOrSlot) {
	const n = slotOf(fileOrSlot) || (manager.validSlot(fileOrSlot) ? Number(fileOrSlot) : 0);
	if (!n) return false;
	return manager.resetSlot(n);
}

function nextAvailable(fileOrSlot) {
	const current = slotOf(fileOrSlot) || (manager.validSlot(fileOrSlot) ? Number(fileOrSlot) : manager.loadState().active || 0);
	const n = manager.nextAvailable(current);
	return n ? { slot: n, file: FILES[n - 1] } : null;
}

const STATUS_TEXT = manager.LABEL;

function statusTable({ active, results } = {}) {
	const activeSlot = manager.validSlot(active) ? Number(active) : slotOf(active);
	const state = manager.loadState();
	return FILES.map((file, i) => {
		const n = i + 1;
		const a = manager.inspect(n, state);
		const r = results && results[file];
		let row;
		if (activeSlot === n) {
			row = { slot: n, file, status: STATUS_TEXT.active, detail: a.maskedID ? `id ${a.maskedID}` : "" };
		}
		else if (r) {
			row = { slot: n, file, status: r.status, detail: r.detail || "" };
		}
		else {
			const d = manager.describe(n, state);
			row = { slot: n, file, status: d.status, detail: d.detail, icon: d.icon };
		}
		row.icon = row.icon || (row.status.includes("ACTIVE") ? "🟢" : row.status.includes("AVAILABLE") ? "🔵" : row.status.includes("SUSPENDED") ? "🔴" : row.status.includes("EMPTY") ? "⚪" : "🟠");
		return row;
	});
}

function toObject(table) {
	const o = {};
	for (const r of table || []) o[r.file] = { status: r.status, detail: r.detail };
	return o;
}

function describeAll(active) {
	const activeSlot = manager.validSlot(active) ? Number(active) : slotOf(active) || manager.loadState().active;
	const state = manager.loadState();
	return FILES.map((file, i) => ({ ...manager.describe(i + 1, state), active: activeSlot === i + 1 }));
}

function takeNotices() {
	return notices.splice(0, notices.length);
}

module.exports = {
	FILES, SLOTS: manager.SLOTS, short, errText, classify,
	seedFromEnv: manager.seedFromEnv,
	readText, filePath, hashText, candidates, parse,
	tryLogin, markOk, markDead, markFailed, setActive, clearPreferred,
	statusTable, toObject, filterKeys, appStateIsHealthy, writeText, cookieString, takeNotices,
	switchTo, resetSlot, nextAvailable, describeAll,
	getForced: manager.getForced, slotOf, manager
};
